import React from "react";
import {Scrollbars} from "react-custom-scrollbars";

const CustomScrollbars = (props) => <Scrollbars  {...props} autoHide
                                                 renderThumbVertical={({style, ...rest}) =>
                                                   <div {...rest} style={{...style, backgroundColor: '#e84545', borderRadius: 4, width: 6, opacity: 0.85}} />}
                                                 renderTrackVertical={({style, ...rest}) =>
                                                   <div {...rest} style={{...style, right: 2, bottom: 2, top: 2, borderRadius: 4, width: 8}} />}
                                                 renderTrackHorizontal={props => <div {...props}
                                                                                      style={{display: 'none'}}
                                                                                      className="track-horizontal"/>}/>;

export default CustomScrollbars;
