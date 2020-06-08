Ext.define('Fortitude.multidesktop.override.Component', {
  override: 'Ext.Component',

  getId: function() {
    const generatedId = !(this.id || (this.id = this.initialConfig.id)),
      desktopPrefix = `ftde-${window.desktop.desktopId}-`,
      regexp = new RegExp(desktopPrefix);

    this.callParent(arguments);
    generatedId && !this.id.match(regexp) && (this.id = `${desktopPrefix}${this.id}`);
    return this.id;
  }
});
