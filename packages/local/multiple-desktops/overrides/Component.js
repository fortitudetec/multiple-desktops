Ext.define('Ft.multidesktop.override.Component', {
  override: 'Ext.Component',

  getId: function() {
    const generatedId = !(this.id || (this.id = this.initialConfig.id)),
      desktopPrefix = `ft-${window.desktop.desktopId}-`,
      regexp = new RegExp(desktopPrefix);

    this.callParent(arguments);
    generatedId && !this.id.match(regexp) && (this.id = `${desktopPrefix}${this.id}`);
    return this.id;
  }
});
