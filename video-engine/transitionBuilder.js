module.exports = {

  getXfade: (id) => {
    const map = {
      fade: 'fade',
      crossfade: 'fade',
      black: 'fadeblack',
      white: 'fadewhite',
      slideleft: 'slideleft',
      slideright: 'slideright',
      slideup: 'slideup',
      slidedown: 'slidedown',
      wipe: 'wipeleft',
      circle: 'circleopen',
      zoomin: 'zoomin',
      zoomout: 'zoomout'
    };

    return map[id] || 'fade';
  }

};
