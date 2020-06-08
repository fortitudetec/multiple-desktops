Ext.define('Ft.multidesktop.model.Desktop', {
  extend: 'Ext.data.Model',

  fields: ['sessionPrefix', 'title'],

  proxy: {
    type: 'memory',
    reader: 'json',
    writer: 'json'
  }
});
