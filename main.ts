import {
    App,
    Modal,
    Plugin,
    SuggestModal, TextComponent, TFolder,
} from 'obsidian';
import fetch from 'electron-fetch';
import sanitize from "sanitize-filename";
import {format} from 'date-fns';
import * as fs from "fs";

interface MyPluginSettings {
    mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    mySetting: 'default'
}

// noinspection JSUnusedGlobalSymbols
export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;
    // TODO: make this a setting
    static readingListPath = 'Archive/Research/Reading Lists'

    async getPossibleTitlesAtUrl(url: string) {
        try {
            const result = await fetch(url, {useElectronNet: false});
            const el = document.createElement('html');
            el.innerHTML = await result.text();
            const titleTag = el.getElementsByTagName('title') || [];
            const h1Headings = el.getElementsByTagName('h1') || [];
            const h2Headings = el.getElementsByTagName('h2') || [];
            // @ts-ignore
            return [...titleTag, ...h1Headings, ...h2Headings].map(
                (node) => node.innerText.trim().replace(/\r\n/g, ' ').replace(/:+/, '-')
            );
        } catch (ex) {
            return undefined;
        }
    }

    async getReadingListOptions() {
        // This isn't in the api yet, but it works..
        // @ts-ignore
        const file = this.app.workspace.activeLeaf?.view?.file;
        const currentNoteDirectory = this.app.fileManager.getNewFileParent(file?.path ?? '').path;
        try {
            const readingListFolder = this.app.vault.getAbstractFileByPath(MyPlugin.readingListPath)
            if (readingListFolder == null) return [currentNoteDirectory]
            if (!(readingListFolder instanceof TFolder)) return [currentNoteDirectory]
            // Return sub-folders in the root reading lists folder.
            return [currentNoteDirectory, ...readingListFolder.children.filter(child => child instanceof TFolder).map(e => e.path)]
        } catch (ex) {
            return [currentNoteDirectory];
        }
    }

    async addItem(url: string, heading: string, directoryPath: string, contentType: string, author: string, source: string, whyRead: string, priority: string, tags: string) {

        const fileName = sanitize(heading);
        const newFilePath = `${directoryPath}/${fileName}.md`;

        const template = `---
# Date Added
added: ${format(new Date(), "yyyy-MM-dd HH:mm")}
# Book, Article, Paper, etc.
contentType: "${contentType}"
# A link to the resource
link: "${url}"
# Author
author: "${author}"
# The year or more specific that the article was published
published: "Unknown"
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

Link: [${heading}](${url})

# ${heading}

`

        const exists = await new Promise((resolve) =>
            fs.stat(newFilePath, (err, stats) =>
                resolve(!err && stats.isFile())
            ));
        console.log(`File ${newFilePath} already existed.  Aborting.`);
        if (exists) return;
        const newFile = await this.app.vault.create(newFilePath, template);
        await this.app.workspace.activeLeaf.openFile(newFile);
    }

    async onload() {
        console.log('loading plugin ObsidianReadingList');

        await this.loadSettings();

        this.addCommand({
            id: 'add-reading-item',
            name: 'Add Item To Reading List',
            checkCallback: (checking: boolean) => {
                let leaf = this.app.workspace.activeLeaf;
                if (leaf) {
                    if (!checking) {
                        new TextModal(this.app, 'URL').open().then(async (url) => {
                            const title = await choiceModal(this.app, (await this.getPossibleTitlesAtUrl(url)) || [], 'Title');
                            const readingListPath = await choiceModal(this.app, (await this.getReadingListOptions()) || [], 'List');
                            const suggestions = ['Book', 'Article', 'Paper', 'Forum', 'Documentation', 'Presentation', 'Other'];
                            const contentType = await choiceModal(this.app, suggestions, 'ContentType');
                            const author = await textModal(this.app, 'Author');
                            const source = await textModal(this.app, 'A description of where you found this resource.  How did you come across it?');
                            const whyRead = await textModal(this.app, 'Why should you read it?');
                            const priority = await textModal(this.app, 'Priority (1-5)');
                            // TODO: Make tags autocomplete!
                            const tags = await textModal(this.app, 'Enter tags:');
                            await this.addItem(url, title, readingListPath, contentType, author, source, whyRead, priority, tags);
                        })
                    }
                    return true;
                }
                return false;
            }
        });
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

class ChoiceModal extends SuggestModal<string> {
    resolveClosePromise: (result: string) => void
    fieldName: string | undefined;
    suggestions: string[];
    static customTextSuggestion: string = 'Custom Text...'

    constructor(app: App, suggestions: string[], fieldName?: string) {
        super(app);
        this.fieldName = fieldName
        this.suggestions = [...suggestions, ChoiceModal.customTextSuggestion]
    }

    open(): Promise<string> {
        return new Promise((resolve) => {
            super.open()
            this.resolveClosePromise = resolve;
        });
    }

    onOpen() {
        super.onOpen();
        if (!this.fieldName) return
        this.titleEl.innerText = this.fieldName;
        const promptEl = this.inputEl.parentElement;
        if (!promptEl) return;
        promptEl.prepend(this.titleEl);
    }

    /**
     * Called every time the input changes and returns the new suggestions
     * @param query - the text in the modal input so far
     */
    getSuggestions(query: string): string[] {
        return this.suggestions.filter((item) => item.toLowerCase().startsWith(query.toLowerCase()))
    }

    onChooseSuggestion(item: string, evt: MouseEvent | KeyboardEvent): void {
        this.resolveClosePromise(item);
    }

    renderSuggestion(value: string, el: HTMLElement): void {
        el.innerText = value;
    }
}

async function choiceModal(app: App, suggestions: string[], fieldName?: string) {
    const result = await new ChoiceModal(app, suggestions, fieldName).open()
    if (result !== ChoiceModal.customTextSuggestion) return result

    return await textModal(app, fieldName || '')
}

function textModal(app: App, fieldName: string, initialValue?: string) {
    return new TextModal(app, fieldName, initialValue).open();
}

class TextModal extends Modal {
    resolveClosePromise: (result: any) => void
    value: any;
    fieldName: string;
    initialValue?: string;

    constructor(app: App, fieldName: string, initialValue?: string) {
        super(app);
        this.fieldName = fieldName
        this.initialValue = initialValue;
    }

    open(): Promise<string> {
        return new Promise((resolve) => {
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
        input.setValue(this.initialValue ?? '')
        input.inputEl.focus();
        input.inputEl.select();
        input.inputEl.addEventListener('keydown', async (ev) => {
            if (ev.key === 'Enter') {
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
