Ext.define('Fortitude.multidesktop.model.DesktopStatus', {
  extend: 'Ext.data.Model',

  fields: [
    'direction',
    'event',
    'timestamp'
  ],

  hasOne: [{
    name: 'sourceDesktop',
    model: 'Fortitude.multidesktop.model.Desktop'
  }, {
    name: 'targetDesktop',
    model: 'Fortitude.multidesktop.model.Desktop'
  }],

  proxy: {
    type: 'memory',
    reader: 'json',
    writer: 'json'
  }
});
