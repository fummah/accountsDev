/**
 * probe-mail-env.js
 *
 * Read-only probe: what does the mail-client abstraction actually see on THIS
 * machine, with the real Windows registry available?
 *
 * Run WITHOUT ELECTRON_RUN_AS_NODE (plain Electron/Node is fine) and WITHOUT the
 * sandbox, because `reg.exe` is on the sandbox Program Blacklist and its absence
 * makes detectMailClients() return empty values — which would prove nothing.
 *
 *   node scripts/probe-mail-env.js
 *
 * Writes nothing and launches nothing. Safe to run any time.
 */

const MailClient = require('../src/backend/services/mailClient');

function main() {
  const clients = MailClient.detectMailClients();
  const chosen = MailClient.chooseAdapter(clients);

  const report = {
    platform: clients.platform,
    mailtoProgId: clients.progId,
    progIdKind: clients.progIdKind,
    defaultClientName: clients.defaultClientName,
    registeredClients: clients.registeredClients,
    registryReadable: clients.registryReadable,
    outlook: clients.outlook,
    thunderbird: clients.thunderbird,
    chosenAdapter: {
      kind: chosen.kind,
      exe: chosen.exe || null,
      clientReady: chosen.clientReady,
      profileKnown: chosen.profileKnown,
      substituted: !!chosen.substituted,
      reason: chosen.reason,
    },
  };

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');

  // Sanity assertions so this probe can be used as evidence, not just a dump.
  const problems = [];
  if (!clients.platform) problems.push('no platform reported');
  if (clients.outlook && clients.outlook.installed && !clients.outlook.exe) {
    problems.push('Outlook reported installed but with no exe path');
  }
  if (typeof clients.registryReadable !== 'boolean') {
    problems.push('registryReadable is not a boolean');
  }
  if (clients.outlook && typeof clients.outlook.profileKnown !== 'boolean') {
    problems.push('outlook.profileKnown is not a boolean');
  }
  if (clients.outlook && clients.outlook.ready !== (clients.outlook.installed && clients.outlook.mailProfilePresent === true)) {
    problems.push('outlook.ready !== (installed && mailProfilePresent === true)');
  }
  if (clients.outlook && clients.outlook.profileKnown !== (clients.outlook.mailProfilePresent !== null)) {
    problems.push('outlook.profileKnown does not track mailProfilePresent !== null');
  }
  if (typeof chosen.clientReady !== 'boolean') {
    problems.push('chosen.clientReady is not a boolean');
  }

  if (!clients.registryReadable) {
    process.stdout.write(
      '\nNOTE: the registry could not be read in this shell, so progId/registeredClients\n'
      + 'are empty and mailProfilePresent is null (unknown) — NOT "no account".\n'
      + 'Run this probe in a shell where reg.exe is permitted to get real values.\n'
    );
  }

  if (problems.length) {
    process.stdout.write('\nPROBE PROBLEMS:\n  - ' + problems.join('\n  - ') + '\n');
    process.exitCode = 1;
  } else {
    process.stdout.write('\nprobe ok\n');
  }
}

main();
