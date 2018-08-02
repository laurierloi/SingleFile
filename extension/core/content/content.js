/*
 * Copyright 2018 Gildas Lormeau
 * contact : gildas.lormeau <at> gmail.com
 * 
 * This file is part of SingleFile.
 *
 *   SingleFile is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Lesser General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   SingleFile is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Lesser General Public License for more details.
 *
 *   You should have received a copy of the GNU Lesser General Public License
 *   along with SingleFile.  If not, see <http://www.gnu.org/licenses/>.
 */

/* global browser, SingleFile, singlefile, FrameTree, document, Blob, MouseEvent, getSelection, getComputedStyle, prompt, addEventListener, Node, HTMLElement */

this.singlefile.top = this.singlefile.top || (() => {

	let processing = false;
	browser.runtime.onMessage.addListener(async message => {
		savePage(message);
		return {};
	});
	addEventListener("message", event => {
		if (typeof event.data === "string" && event.data.startsWith("__SingleFile__::")) {
			const message = JSON.parse(event.data.substring("__SingleFile__".length + 2));
			savePage(message);
		}
	});
	return true;

	async function savePage(message) {
		if (message.processStart && !processing && !message.options.frameId) {
			processing = true;
			try {
				const page = await processMessage(message);
				downloadPage(page, message.options);
				revokeDownloadURL(page);
			} catch (error) {
				console.error(error); // eslint-disable-line no-console
				browser.runtime.sendMessage({ processError: true, error });
			}
			processing = false;
		}
	}

	async function processMessage(message) {
		const options = await getOptions(message.options);
		const processor = new (SingleFile.getClass())(options);
		fixInlineScripts();
		fixHeadNoScripts();
		if (options.selected) {
			selectSelectedContent(processor.SELECTED_CONTENT_ATTRIBUTE_NAME, processor.SELECTED_CONTENT_ROOT_ATTRIBUTE_NAME);
		}
		if (!options.removeFrames) {
			hideHeadFrames();
		}
		if (options.removeHiddenElements) {
			selectRemovedElements(processor.REMOVED_CONTENT_ATTRIBUTE_NAME);
		}
		if (options.compressHTML) {
			selectPreserveElements(processor.PRESERVED_SPACE_ELEMENT_ATTRIBUTE_NAME);
		}
		options.url = options.url || document.location.href;
		options.content = options.content || getDoctype(document) + document.documentElement.outerHTML;
		await processor.initialize();
		if (options.removeHiddenElements) {
			unselectRemovedElements(processor.REMOVED_CONTENT_ATTRIBUTE_NAME);
		}
		if (options.compressHTML) {
			unselectPreserveElements(processor.PRESERVED_SPACE_ELEMENT_ATTRIBUTE_NAME);
		}
		if (options.shadowEnabled) {
			singlefile.ui.init();
		}
		await processor.preparePageData();
		const page = processor.getPageData();
		if (options.selected) {
			unselectSelectedContent(processor.SELECTED_CONTENT_ATTRIBUTE_NAME, processor.SELECTED_CONTENT_ROOT_ATTRIBUTE_NAME);
		}
		const date = new Date();
		page.filename = page.title + (options.appendSaveDate ? " (" + date.toISOString().split("T")[0] + " " + date.toLocaleTimeString() + ")" : "") + ".html";
		page.url = URL.createObjectURL(new Blob([page.content], { type: "text/html" }));
		if (options.shadowEnabled) {
			singlefile.ui.end();
		}
		return page;
	}

	function revokeDownloadURL(page) {
		URL.revokeObjectURL(page.url);
	}

	function fixInlineScripts() {
		document.querySelectorAll("script").forEach(element => element.textContent = element.textContent.replace(/<\/script>/gi, "<\\/script>"));
	}

	function hideHeadFrames() {
		document.head.querySelectorAll("iframe, frame, object[type=\"text/html\"][data]").forEach(element => element.hidden = true);
	}

	function fixHeadNoScripts() {
		document.head.querySelectorAll("noscript").forEach(noscriptElement => document.body.insertBefore(noscriptElement, document.body.firstChild));
	}

	function selectPreserveElements(PRESERVED_SPACE_ELEMENT_ATTRIBUTE_NAME) {
		document.querySelectorAll("*").forEach(element => {
			const style = getComputedStyle(element);
			if (style.whiteSpace.startsWith("pre")) {
				element.setAttribute(PRESERVED_SPACE_ELEMENT_ATTRIBUTE_NAME, "");
			}
		});
	}

	function unselectPreserveElements(PRESERVED_SPACE_ELEMENT_ATTRIBUTE_NAME) {
		document.querySelectorAll("[" + PRESERVED_SPACE_ELEMENT_ATTRIBUTE_NAME + "]").forEach(element => element.removeAttribute(PRESERVED_SPACE_ELEMENT_ATTRIBUTE_NAME));
	}

	function selectRemovedElements(REMOVED_CONTENT_ATTRIBUTE_NAME) {
		document.querySelectorAll("html > body *:not(style):not(script):not(link)").forEach(element => {
			const style = getComputedStyle(element);
			if (element instanceof HTMLElement && (element.hidden || style.display == "none" || ((style.opacity === 0 || style.visibility == "hidden") && !element.clientWidth && !element.clientHeight))) {
				element.setAttribute(REMOVED_CONTENT_ATTRIBUTE_NAME, "");
			}
		});
	}

	function unselectRemovedElements(REMOVED_CONTENT_ATTRIBUTE_NAME) {
		document.querySelectorAll("[" + REMOVED_CONTENT_ATTRIBUTE_NAME + "]").forEach(element => element.removeAttribute(REMOVED_CONTENT_ATTRIBUTE_NAME));
	}

	function selectSelectedContent(SELECTED_CONTENT_ATTRIBUTE_NAME, SELECTED_CONTENT_ROOT_ATTRIBUTE_NAME) {
		const selection = getSelection();
		const range = selection.rangeCount ? selection.getRangeAt(0) : null;
		const treeWalker = document.createTreeWalker(range.commonAncestorContainer);
		let selectionFound = false;
		const ancestorElement = range.commonAncestorContainer != Node.ELEMENT_NODE ? range.commonAncestorContainer.parentElement : range.commonAncestorContainer;
		ancestorElement.setAttribute(SELECTED_CONTENT_ROOT_ATTRIBUTE_NAME, "");
		while (treeWalker.nextNode() && treeWalker.currentNode != range.endContainer) {
			if (treeWalker.currentNode == range.startContainer) {
				selectionFound = true;
			}
			if (selectionFound) {
				const element = treeWalker.currentNode.nodeType == Node.ELEMENT_NODE ? treeWalker.currentNode : treeWalker.currentNode.parentElement;
				element.setAttribute(SELECTED_CONTENT_ATTRIBUTE_NAME, "");
			}
		}
	}

	function unselectSelectedContent(SELECTED_CONTENT_ATTRIBUTE_NAME, SELECTED_CONTENT_ROOT_ATTRIBUTE_NAME) {
		document.querySelectorAll("[" + SELECTED_CONTENT_ATTRIBUTE_NAME + "]").forEach(selectedContent => selectedContent.removeAttribute(SELECTED_CONTENT_ATTRIBUTE_NAME));
		document.querySelectorAll("[" + SELECTED_CONTENT_ROOT_ATTRIBUTE_NAME + "]").forEach(selectedContent => selectedContent.removeAttribute(SELECTED_CONTENT_ROOT_ATTRIBUTE_NAME));
	}

	async function getOptions(options) {
		options.canvasData = getCanvasData();
		if (!options.removeFrames) {
			options.framesData = await FrameTree.getFramesData();
		}
		options.jsEnabled = true;
		options.onprogress = async event => {
			if (event.type == event.RESOURCES_INITIALIZED || event.type == event.RESOURCE_LOADED) {
				try {
					await browser.runtime.sendMessage({ processProgress: true, index: event.details.index, maxIndex: event.details.max });
				} catch (error) {
					// ignored
				}
				if (options.shadowEnabled) {
					singlefile.ui.onprogress(event);
				}
			} else if (event.type == event.PAGE_ENDED) {
				try {
					await browser.runtime.sendMessage({ processEnd: true });
				} catch (error) {
					// ignored
				}
			}
		};
		return options;
	}

	function getCanvasData() {
		const canvasData = [];
		document.querySelectorAll("canvas").forEach(canvasElement => {
			try {
				canvasData.push({ dataURI: canvasElement.toDataURL("image/png", ""), width: canvasElement.clientWidth, height: canvasElement.clientHeight });
			} catch (error) {
				canvasData.push(null);
			}
		});
		return canvasData;
	}

	function getDoctype(doc) {
		const docType = doc.doctype;
		let docTypeString;
		if (docType) {
			docTypeString = "<!DOCTYPE " + docType.nodeName;
			if (docType.publicId) {
				docTypeString += " PUBLIC \"" + docType.publicId + "\"";
				if (docType.systemId)
					docTypeString += " \"" + docType.systemId + "\"";
			} else if (docType.systemId)
				docTypeString += " SYSTEM \"" + docType.systemId + "\"";
			if (docType.internalSubset)
				docTypeString += " [" + docType.internalSubset + "]";
			return docTypeString + ">\n";
		}
		return "";
	}

	function downloadPage(page, options) {
		if (options.confirmFilename) {
			page.filename = prompt("File name", page.filename);
		}
		if (page.filename && page.filename.length) {
			const link = document.createElement("a");
			document.body.appendChild(link);
			link.download = page.filename;
			link.href = page.url;
			link.dispatchEvent(new MouseEvent("click"));
			link.remove();
		}
	}

})();
