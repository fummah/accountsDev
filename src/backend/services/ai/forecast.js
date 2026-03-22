const Settings = require('../../models/settings');

function tryLoadTf() {
	try {
		return require('@tensorflow/tfjs-node');
	} catch {
		try {
			return require('@tensorflow/tfjs');
		} catch {
			return null;
		}
	}
}

function standardize(series) {
	const mean = series.reduce((a,b)=>a+b,0)/Math.max(1, series.length);
	const std = Math.sqrt(series.reduce((a,b)=>a+Math.pow(b-mean,2),0)/Math.max(1, series.length)) || 1;
	const norm = series.map(v => (v - mean)/std);
	return { norm, mean, std };
}

function olsForecast(series, months) {
	// Simple linear regression y = a + b*t
	const n = series.length;
	if (n === 0) return Array.from({length: months}, ()=>0);
	let sumX=0,sumY=0,sumXY=0,sumXX=0;
	for (let i=0;i<n;i++){ const x=i+1, y=series[i]; sumX+=x; sumY+=y; sumXY+=x*y; sumXX+=x*x; }
	const denom = n*sumXX - sumX*sumX || 1;
	const b = (n*sumXY - sumX*sumY)/denom;
	const a = (sumY - b*sumX)/n;
	const out=[]; let lastX=n;
	for (let k=1;k<=months;k++){ lastX+=1; out.push(a + b*lastX); }
	return out.map(v => Number(v.toFixed(2)));
}

async function trainSeriesTF(series, { windowSize=3, epochs=50, learningRate=0.01 } = {}) {
	const tf = tryLoadTf();
	if (!tf) {
		return { backend: 'fallback', model: { type: 'ols' } };
	}
	const { norm, mean, std } = standardize(series);
	const xs=[]; const ys=[];
	for (let i=0;i+windowSize<norm.length;i++){
		xs.push(norm.slice(i, i+windowSize));
		ys.push(norm[i+windowSize]);
	}
	if (xs.length < 2) return { backend: 'fallback', model: { type: 'ols' } };
	const xT = tf.tensor2d(xs);
	const yT = tf.tensor2d(ys, [ys.length, 1]);
	const model = tf.sequential();
	model.add(tf.layers.dense({ units: 8, activation: 'relu', inputShape: [windowSize] }));
	model.add(tf.layers.dense({ units: 1 }));
	model.compile({ optimizer: tf.train.adam(learningRate), loss: 'meanSquaredError' });
	await model.fit(xT, yT, { epochs, verbose: 0 });
	const weights = model.getWeights().map(w => ({ data: Array.from(w.dataSync()), shape: w.shape }));
	xT.dispose(); yT.dispose();
	return { backend: tf.getBackend ? tf.getBackend() : 'tfjs', model: { type: 'dense', windowSize, mean, std, weights } };
}

function predictTF(lastSeries, modelInfo, months) {
	const tf = tryLoadTf();
	if (!tf || !modelInfo || modelInfo.type !== 'dense') return null;
	const { windowSize, mean, std, weights } = modelInfo;
	const model = tf.sequential();
	model.add(tf.layers.dense({ units: 8, activation: 'relu', inputShape: [windowSize] }));
	model.add(tf.layers.dense({ units: 1 }));
	const vars = model.getWeights();
	const tensors = weights.map(w => tf.tensor(w.data, w.shape));
	model.setWeights(tensors);
	vars.forEach(v => v.dispose());
	// build initial window
	const norm = lastSeries.map(v => (v - mean)/std);
	let win = norm.slice(-windowSize);
	const out = [];
	for (let i=0;i<months;i++){
		const x = tf.tensor2d([win]);
		const y = model.predict(x);
		const yv = Array.from(y.dataSync())[0];
		x.dispose(); y.dispose();
		const denorm = yv*std + mean;
		out.push(Number(denorm.toFixed(2)));
		win = win.slice(1).concat([yv]);
	}
	return out;
}

function keyFor(target) {
	return `ai.models.${target}`;
}

function saveModel(target, model) {
	const key = keyFor(target);
	Settings.set(key, model);
	return true;
}

function loadModel(target) {
	const key = keyFor(target);
	return Settings.get(key) || null;
}

module.exports = {
	train: async function(series, target, opts) {
		if (!Array.isArray(series) || series.length < 4) {
			const model = { type: 'ols' };
			saveModel(target, model);
			return { success: true, backend: 'fallback', model };
		}
		const trained = await trainSeriesTF(series, opts || {});
		let model = trained.model;
		if (model && model.type === 'dense') {
			saveModel(target, model);
			return { success: true, backend: trained.backend, model };
		}
		// fallback OLS
		model = { type: 'ols' };
		saveModel(target, model);
		return { success: true, backend: 'fallback', model };
	},
	predict: function(historySeries, target, months) {
		const model = loadModel(target);
		if (!model) return { success: false, error: 'No model trained' };
		if (model.type === 'dense') {
			const out = predictTF(historySeries, model, months);
			if (out) return { success: true, values: out };
		}
		// fallback
		return { success: true, values: olsForecast(historySeries, months) };
	}
};
