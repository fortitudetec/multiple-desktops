Ext.define('Ft.multidesktop.model.DesktopStatus', {
  extend: 'Ext.data.Model',

  fields: [
    'direction',
    'event',
    'timestamp'
  ],

  hasOne: [{
    name: 'sourceDesktop',
    model: 'Ft.multidesktop.model.Desktop'
  }, {
    name: 'targetDesktop',
    model: 'Ft.multidesktop.model.Desktop'
  }],

  proxy: {
    type: 'memory',
    reader: 'json',
    writer: 'json'
  }
});
