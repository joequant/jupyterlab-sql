
import { Menu, Widget, BoxPanel } from '@phosphor/widgets';

import { ISignal, Signal } from '@phosphor/signaling';

import { IDisposable } from '@phosphor/disposable';

import { CommandRegistry } from '@phosphor/commands';

import { Clipboard, Toolbar } from '@jupyterlab/apputils';

import { PreWidget, SingletonPanel, Table, ToolbarItems } from '../components';

import * as Api from '../api'

import { proxyFor } from '../services';

import { JupyterLabSqlPage, PageName } from '../page';

// TODO break up into multiple source files?
// TODO bind double click to navigating to table

namespace DatabaseSummaryPage {
  export interface IOptions {
    connectionUrl: string;
  }
}

// TODO dispose of toolbar
export class DatabaseSummaryPage implements JupyterLabSqlPage {
  constructor(options: DatabaseSummaryPage.IOptions) {
    this._content = new Content(options);
    this._toolbar = new DatabaseSummaryToolbar(options.connectionUrl);
    this._navigateBack = proxyFor(this._toolbar.backButtonClicked, this);
    this._customQueryClicked = proxyFor(this._content.customQueryClicked, this);
    this._navigateToTable = proxyFor(this._content.navigateToTable, this);
  }

  get content(): Widget {
    return this._content
  }

  get toolbar(): Toolbar {
    return this._toolbar
  }

  get navigateBack(): ISignal<this, void> {
    return this._navigateBack;
  }

  get customQueryClicked(): ISignal<this, void> {
    return this._customQueryClicked;
  }

  get navigateToTable(): ISignal<this, string> {
    return this._navigateToTable
  }

  readonly pageName: PageName = PageName.DatabaseSummary;
  private readonly _toolbar: DatabaseSummaryToolbar;
  private readonly _content: Content;
  private readonly _navigateBack: Signal<this, void>;
  private readonly _customQueryClicked: Signal<this, void>
  private readonly _navigateToTable: Signal<this, string>
}

class Content extends BoxPanel {
  constructor(options: DatabaseSummaryPage.IOptions) {
    super();
    this._responseWidget = new ResponseWidget()
    this._responseWidget.setLoading()
    this._responseWidget.navigateToTable.connect((_, tableName) => {
      this._navigateToTable.emit(tableName)
    })
    const customQueryWidget = new CustomQueryWidget()
    customQueryWidget.clicked.connect(() => this._customQueryClicked.emit(void 0))
    this.addWidget(customQueryWidget);
    this.addWidget(this._responseWidget);
    BoxPanel.setSizeBasis(customQueryWidget, 30);
    BoxPanel.setStretch(this._responseWidget, 1)
    this._getStructure(options.connectionUrl)
  }

  get customQueryClicked(): ISignal<this, void> {
    return this._customQueryClicked;
  }

  get navigateToTable(): ISignal<this, string> {
    return this._navigateToTable
  }

  private async _getStructure(connectionUrl: string): Promise<void> {
    const response = await Api.getStructure(connectionUrl)
    this._responseWidget.setResponse(response)
  }

  private readonly _responseWidget: ResponseWidget
  private readonly _customQueryClicked = new Signal<this, void>(this);
  private readonly _navigateToTable = new Signal<this, string>(this);
}

class CustomQueryWidget extends Widget {
  constructor() {
    super();
    const element = document.createElement('div');
    const button = document.createElement('button');
    button.innerHTML = 'Custom query';
    button.onclick = () => this._clicked.emit(void 0);
    element.appendChild(button);
    this.node.appendChild(element);
  }

  get clicked(): ISignal<this, void> {
    return this._clicked;
  }

  private readonly _clicked = new Signal<this, void>(this);
}

class ResponseWidget extends SingletonPanel {

  // TODO: Dispose of signals

  setResponse(response: Api.StructureResponse.Type) {
    this._disposeTable();
    Api.StructureResponse.match(
      response,
      tables => {
        this._table = new DatabaseSummaryTable(tables)
        this._table.navigateToTable.connect((_, tableName) => {
          this._navigateToTable.emit(tableName)
        })
        this.widget = this._table.widget
      },
      () => {
        // TODO handle error
        this.widget = new PreWidget('oops')
      }
    )
  }

  setLoading() {
    this.widget = new PreWidget('Fetching database summary...')
  }

  get navigateToTable(): ISignal<this, string> {
    return this._navigateToTable;
  }

  private _disposeTable(): void {
    if (this._table) {
      this._table.dispose()
    }
    this._table = null;
  }

  private _table: DatabaseSummaryTable | null = null;
  private readonly _navigateToTable = new Signal<this, string>(this);
}

class DatabaseSummaryTable implements IDisposable {
  constructor(tables: Array<string>) {
    const contextMenu = this._createContextMenu()
    const data = tables.map(table => { return [table] });
    this._table = Table.fromKeysRows(['tables'], data, { contextMenu })
  }

  dispose(): void {
    this._table.dispose();
    this._isDisposed = true;
  }

  get widget(): Widget {
    return this._table.widget;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  get navigateToTable(): ISignal<this, string> {
    return this._navigateToTable;
  }

  private _createContextMenu(): Menu {
    const commands = new CommandRegistry();
    commands.addCommand(DatabaseSummaryTable.CommandIds.copyToClipboard, {
      label: 'Copy cell',
      iconClass: 'jp-MaterialIcon jp-CopyIcon',
      execute: () => this._copySelectionToClipboard()
    })
    commands.addCommand(DatabaseSummaryTable.CommandIds.viewTable, {
      label: 'View table',
      execute: () => this._navigateToSelectedTable()
    })
    const menu = new Menu({ commands });
    menu.addItem({ command: DatabaseSummaryTable.CommandIds.copyToClipboard })
    menu.addItem({ command: DatabaseSummaryTable.CommandIds.viewTable })
    return menu
  }

  private _copySelectionToClipboard(): void {
    const selectionValue = this._table.selectionValue;
    if (selectionValue !== null) {
      Clipboard.copyToSystem(selectionValue)
    }
  }

  private _navigateToSelectedTable(): void {
    const selectionValue = this._table.selectionValue;
    if (selectionValue !== null) {
      this._navigateToTable.emit(selectionValue);
    }
  }

  private readonly _table: Table;
  private readonly _navigateToTable = new Signal<this, string>(this)
  private _isDisposed: boolean = false;
}

namespace DatabaseSummaryTable {
  export namespace CommandIds {
    export const copyToClipboard = 'copy-selection-to-clipboard';
    export const viewTable = 'view-table';
  }
}

class DatabaseSummaryToolbar extends Toolbar {
  constructor(connectionUrl: string) {
    super()
    this._onBackButtonClicked = this._onBackButtonClicked.bind(this)
    this.addItem(
      'back',
      new ToolbarItems.BackButton({ onClick: this._onBackButtonClicked })
    )
    this.addItem('spacer', Toolbar.createSpacerItem())
    this.addItem('url', new ToolbarItems.TextItem(connectionUrl))
  }

  get backButtonClicked(): ISignal<this, void> {
    return this._backButtonClicked;
  }

  private _onBackButtonClicked(): void {
    this._backButtonClicked.emit(void 0);
  }

  private readonly _backButtonClicked: Signal<this, void> = new Signal(this);
}
