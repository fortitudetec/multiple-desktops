Ext.define('Ft.multidesktop.window.Dialog', {
  extend: 'Ext.window.Window',
  alias: 'widget.ft-dialog',

  showButtons: true,
  okButtonText: 'Ok',
  cancelButtonText: 'Cancel',
  closeOnOk: true,
  layout: 'fit',
  minWidth: 200,
  minHeight: 150,
  minimizable: true,
  maximizable: true,

  config: {
    okButton: null,
    cancelButton: null
  },

  initComponent: function() {
    this.desktopMovable = false;
    this.addCls(this.xtype);
    this.dockedItems = this.dockedItems || [];
    this.showButtons && this._buildButtons();
    this._buildUI();
    this.callParent(arguments);
    this._setButtons();
    this.formBind && this._bindToForm();
  },

  privates: {
    _bindToForm: function() {
      const form = this.down('form'),
        okButton = this.getOkButton();

      if (okButton) {
        okButton.setDisabled(true);
        form.on('validitychange', (_form, isValid) => okButton.setDisabled(!isValid));
      }
    },

    _buildButtons: function() {
      const buttons = [];
      if (this.showOkButton !== false) {
        buttons.push(Ext.apply({
          xtype: 'button',
          itemId: 'okBtn',
          text: this.okButtonText,
          handler: () => {
            this.fireEvent('ok', this);
            this.closeOnOk && this.close();
          }
        }, this.okButtonConfig));
      }
      if (this.showCancelButton !== false) {
        buttons.push(Ext.apply({
          xtype: 'button',
          itemId: 'cancelBtn',
          text: this.cancelButtonText,
          handler: () => {
            this.fireEvent('cancel', this);
            this.close();
          }
        }, this.cancelButtonConfig));
      }

      !Ext.isEmpty(buttons) && this.dockedItems.push({
        xtype: 'toolbar',
        itemId: 'buttonBar',
        dock: 'bottom',
        items: Ext.Array.push(['->'], buttons)
      });
    },

    _buildUI: function() {
      if (this.html) {
        this.items = {
          xtype: 'component',
          cls: 'ft-dialog-html-body',
          html: this.html
        };
        // so we don't step on the 'html' property of the Window
        this.html = undefined;
      }

      if (this.icon) {
        this.dockedItems.push({
          dock: 'left',
          xtype: 'container',
          layout: {
            type: 'vbox',
            align: 'middle',
            pack: 'center'
          },
          items: {
            xtype: 'component',
            html: `<i class="${this.icon}"></i>`
          }
        });
      }
    },

    _setButtons: function() {
      const buttonBar = this.getDockedComponent('buttonBar'),
        okButton = buttonBar && buttonBar.down('#okBtn'),
        cancelButton = buttonBar && buttonBar.down('#cancelBtn');

      okButton && this.setOkButton(okButton);
      cancelButton && this.setCancelButton(cancelButton);
    }
  },

  statics: {
    ERROR: 'x-fa fas fa-exclamation-circle ft-dialog-icon ft-dialog-icon-error',
    QUESTION: 'x-fa fas fa-question-circle ft-dialog-icon ft-dialog-icon-question',
    WARNING: 'x-fa fas fa-exclamation-triangle ft-dialog-icon ft-dialog-icon-warning',

    errorDialog: function(config) {
      new Ft.multidesktop.window.Dialog(Ext.apply({
        title: 'Error',
        icon: this.ERROR,
        showCancelButton: false
      }, config)).show();
    }
  }
});
