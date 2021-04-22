import {
    App,
    Modal,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting, TextComponent,
} from 'obsidian';
import fetch from 'electron-fetch';
import sanitize from "sanitize-filename";
import {format} from 'date-fns';

interface MyPluginSettings {
    mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    mySetting: 'default'
}

// noinspection JSUnusedGlobalSymbols
export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;

    async addItem(url: string, author: string, source: string, whyRead: string, priority: string, tags: string) {
        let headings;
        try {
            const result = await fetch(url, {useElectronNet: false});
            const el = document.createElement('html');
            el.innerHTML = await result.text();
            headings = el.getElementsByTagName('h1');
        } catch (ex) {
            console.error(ex);
        }
        console.log(headings);
        const heading = headings?.[0]?.innerText;
        if (heading == null) {
            console.log('invalid header so not sure what to call a new file!');
            return;
        }

        const fileName = sanitize(heading);

        const file = this.app.workspace.activeLeaf?.view?.file;
        const newFileParentPath = this.app.fileManager.getNewFileParent(file?.path ?? '').path;
        const newFilePath = `${newFileParentPath}/${fileName}.md`;

        const template = `
---
# Date Added
added: ${format(new Date(), "yyyy-MM-dd HH:mm")}
# A link to the resource
link: "${url}"
# Author
author: "${author}"
# A description of where you found this resource.  How did you come across it?
source: "${source}"
# A description of why to read it
whyRead: "${whyRead}"
# Review priority (1-5)
priority: ${priority}
# Rating (1-5)
rating: 0
# Date that you finished reading it
finished: 
---
#toRead ${tags}

# ${heading}

`

        await this.app.vault.create(newFilePath, template);
    }

    async onload() {
        console.log('loading plugin');

        await this.loadSettings();

        this.addRibbonIcon('dice', 'Sample Plugin', () => {
            new Notice('This is a notice!');
        });

        this.addCommand({
            id: 'add-reading-item',
            name: 'Add Item To Reading List',
            // callback: () => {
            // 	console.log('Simple Callback');
            // },
            checkCallback: (checking: boolean) => {
                let leaf = this.app.workspace.activeLeaf;
                if (leaf) {
                    if (!checking) {

                        new TextModal(this.app, 'URL').open().then(async (url) => {
                            const author = await new TextModal(this.app, 'Author').open();
                            const source = await new TextModal(this.app, 'A description of where you found this resource.  How did you come across it?').open();
                            const whyRead = await new TextModal(this.app, 'Why should you read it?').open();
                            const priority = await new TextModal(this.app, 'Priority (1-5)').open();
                            const tags = await new TextModal(this.app, 'Enter tags:').open();
                            await this.addItem(url, author, source, whyRead, priority, tags);
                        })
                    }
                    return true;
                }
                return false;
            }
        });

        this.addSettingTab(new SampleSettingTab(this.app, this));

        this.registerCodeMirror((cm: CodeMirror.Editor) => {
            console.log('codemirror', cm);
        });

        this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
            console.log('click', evt);
        });

        this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
    }

    onunload() {
        console.log('unloading plugin');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class TextModal extends Modal {
    resolveClosePromise: (result: any) => void
    value: any;
    fieldName: string;

    constructor(app: App, fieldName: string) {
        super(app);
        this.fieldName = fieldName
    }

    open(): Promise<any> {
        return new Promise((resolve, reject) => {
            super.open()
            this.resolveClosePromise = resolve;
        });
    }

    onOpen() {
        this.value = undefined;
        const div = this.contentEl.createDiv();
        div.innerHTML = `<b>${this.fieldName}</b>`;
        this.contentEl.append(div);
        const input = new TextComponent(this.contentEl);
        input.inputEl.focus();
        input.inputEl.addEventListener('keydown', async (ev) => {
            if (ev.key === 'Enter' || ev.keyCode === 13) {
                this.value = input.getValue();
                this.close();
            }
        })
    }

    onClose() {
        let {contentEl} = this;
        contentEl.empty();
        this.resolveClosePromise(this.value);
    }
}

class SampleSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        let {containerEl} = this;

        containerEl.empty();

        containerEl.createEl('h2', {text: 'Settings for my awesome plugin.'});

        new Setting(containerEl)
            .setName('Setting #1')
            .setDesc('It\'s a secret')
            .addText(text => text
                .setPlaceholder('Enter your secret')
                .setValue('')
                .onChange(async (value) => {
                    console.log('Secret: ' + value);
                    this.plugin.settings.mySetting = value;
                    await this.plugin.saveSettings();
                }));
    }
}
