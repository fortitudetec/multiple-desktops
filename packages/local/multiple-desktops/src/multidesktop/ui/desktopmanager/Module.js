Ext.define('Fortitude.multidesktop.ui.desktopmanager.Module', {
  extend: 'Ext.ux.desktop.Module',

  id: 'desktopmanager',

  init: function() {
    this.launcher = {
      text: 'Desktop Manager',
      iconCls: 'x-fa fas fa-chalkboard-teacher',
      handler: this.createWindow,
      scope: this,
      windowId: 'ftde-desktop-manager'
    };
  },

  createWindow: function() {
    const desktop = this.app.getDesktop(),
      win = desktop.getWindow('ftde-desktop-manager') || desktop.createWindow({
        id: 'ftde-desktop-manager',
        controller: {
          type: 'ftde-desktopmanager'
        },
        title: this.launcher.text,
        iconCls: 'x-fa fas fa-chalkboard-teacher',
        constrainHeader: true,
        items: {
          xtype: 'ftde-desktopmanagerview',
          reference: 'desktopManagerView',
          width: 1200,
          height: 600
        }
      });
    win.show();
    return win;
  }
});
