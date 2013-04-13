moduleAid.VERSION = '1.0.0';

// The counter and grid are so intricately connected I can't separate them and put them in their own modules.

// ---- Counter stuff -----

this.__defineGetter__('findbarContainer', function() { return gFindBar.getElement('findbar-container'); });

this.REDOINGHIGHLIGHTS = false;
this.__defineGetter__('counter', function() { return gFindBar._findStatusDesc.textContent; });
this.__defineSetter__('counter', function(v) { return gFindBar._findStatusDesc.textContent = v; });

this.alwaysUpdateStatusUI = function(e) {
	// toggleHighlight() doesn't update the UI in these conditions, we need it to, to update the counter (basically hide it)
	if(e.detail && !gFindBar._findField.value) {
		gFindBar._updateStatusUI(gFindBar.nsITypeAheadFind.FIND_FOUND);
	}
};

this.alwaysToggleHighlight = function() {
	// _find() doesn't toggleHighlight if checkbox is unchecked, we need it to, to update the counter
	if(!gFindBar.getElement("highlight").checked) {
              gFindBar._setHighlightTimeout();
	}
};

this.moveHighlightsArray = function(level, highlights) {
	if(!prefAid.useCounter) { return; }
	
	for(var l=0; l<level.length; l++) {
		if(typeof(level[l].highlights) != 'undefined') {
			for(var i=0; i<level[l].highlights.length; i++) {
				highlights.push(level[l].highlights[i]);
			}
		}
		if(typeof(level[l].levels) != 'undefined') {
			moveHighlightsArray(level[l].levels, highlights);
		}
	}
};

this.fillHighlightCounter = function(e) {
	if(e && e.detail.res && e.detail.res == gFindBar.nsITypeAheadFind.FIND_NOTFOUND) {
		return;
	}
	
	if(!linkedPanel._counterHighlights || linkedPanel._counterHighlights.length == 0) { return; }
	
	var contentWindow = gFindBar.browser._fastFind.currentWindow || gFindBar.browser.contentWindow;
	if(!contentWindow) { return; } // Usually triggered when a selection is on a frame and the frame closes
		
	var editableNode = gFindBar.browser._fastFind.foundEditable;
	var controller = (editableNode && editableNode.editor) ? editableNode.editor.selectionController : null;
	if(controller) {
		var sel = controller.getSelection(gFindBar.nsISelectionController.SELECTION_NORMAL);
	} else {
		var sel = gFindBar._getSelectionController(contentWindow).getSelection(gFindBar.nsISelectionController.SELECTION_NORMAL);
	}
	
	var h = 0;
	if(sel.rangeCount == 1) {
		// Most times we don't need to start from the beginning of the array, it's faster to resume from a previous point
		var start = linkedPanel._currentHighlight || 0;
		if(start >= linkedPanel._counterHighlights.length) {
			start = 0;
		}
		linkedPanel._currentHighlight = 0;
		
		for(var i=start; i<linkedPanel._counterHighlights.length; i++) {
			if(checkCurrentHighlight(contentWindow, sel.getRangeAt(0), linkedPanel._counterHighlights[i])) {
				h = i+1;
				linkedPanel._currentHighlight = i;
				break;
			}
		}
		
		if(h == 0 && start > 0) {
			for(var i=0; i<start; i++) {
				if(checkCurrentHighlight(contentWindow, sel.getRangeAt(0), linkedPanel._counterHighlights[i])) {
					h = i+1;
					linkedPanel._currentHighlight = i;
					break;
				}
			}
		}
		
		if(!REDOINGHIGHLIGHTS && h == 0 && linkedPanel._counterHighlights.length > 0) {
			REDOINGHIGHLIGHTS = true;
			gFindBar.toggleHighlight(documentHighlighted);
			REDOINGHIGHLIGHTS = false;
			return;
		}
	}
	
	counter = stringsAid.get('counter', 'counterFormat', [ ["$hit$", h], ["$total$", linkedPanel._counterHighlights.length] ]);
	
	dispatch(gFindBar, { type: 'HighlightCounterUpdated', cancelable: false });
};

this.checkCurrentHighlight = function(contentWindow, current, highlight) {
	if(highlight.contentWindow == contentWindow
	&& highlight.startContainer == current.startContainer
	&& highlight.startOffset == current.startOffset
	&& highlight.endContainer == current.endContainer
	&& highlight.endOffset == current.endOffset) {
		return true;
	}
	return false;
};

this.toggleCounter = function() {
	if(!prefAid.useCounter || UNLOADED) {
		listenerAid.remove(gFindBar, 'FoundAgain', fillHighlightCounter);
		listenerAid.remove(gFindBar, 'UpdatedStatusFindBar', fillHighlightCounter);
		listenerAid.remove(gFindBar, 'ToggledHighlight', alwaysUpdateStatusUI);
		listenerAid.remove(gFindBar, 'FoundFindBar', alwaysToggleHighlight);
	}
	else {
		listenerAid.add(gFindBar, 'FoundAgain', fillHighlightCounter);
		listenerAid.add(gFindBar, 'UpdatedStatusFindBar', fillHighlightCounter);
		listenerAid.add(gFindBar, 'ToggledHighlight', alwaysUpdateStatusUI);
		listenerAid.add(gFindBar, 'FoundFindBar', alwaysToggleHighlight);
	}
	
	if(!UNLOADED) {
		observerAid.notify('ReHighlightAll');
	}
}

// ----- Grid Stuff -----

this.ROWS_MINIMUM = 150; // number of rows in the highlight grid - kind of the "highlight granularity"
this.ROWS_MULTIPLIER = 2; // Add extra rows if their height exceeds this value

this.__defineGetter__('grid', function() {
	var grids = linkedPanel.querySelectorAll('[anonid="findGrid"]');
	if(grids.length > 0) {
		return grids[0];
	}
	
	// First the grid itself
	var boxNode = document.createElement('hbox');
	boxNode.setAttribute('anonid', 'gridBox');
	
	var gridNode = document.createElement('grid');
	gridNode.setAttribute('anonid', 'findGrid');
	
	// Then columns
	var columns = document.createElement('columns');
	columns = gridNode.appendChild(columns);
	var column = document.createElement('column');
	column = columns.appendChild(column);
	
	// Then start adding the rows
	var rows = document.createElement('rows');
	rows = gridNode.appendChild(rows);
	
	// Starting with the top spacer
	var topspacer = document.createElement('row');
	topspacer.setAttribute('flex', '0');
	topspacer = rows.appendChild(topspacer);
	
	// Actual highlight rows
	var row = document.createElement('row');
	row.setAttribute('flex', '1');
	row = rows.appendChild(row);
	
	// we need to append all the rows
	var row_i = null;
	for(var i=1; i<ROWS_MINIMUM; i++) {
		row_i = row.cloneNode(true);
		rows.appendChild(row_i);
	}
	
	// append another spacer at the bottom
	var bottomspacer = topspacer.cloneNode(true);
	rows.appendChild(bottomspacer);
	
	// Insert the grid into the tab
	boxNode = gBrowser.mCurrentBrowser.parentNode.appendChild(boxNode);
	gridNode = boxNode.appendChild(gridNode);
	
	return gridNode;
});

// Prepares the grid to be filled with the highlights
this.resetHighlightGrid = function() {
	var rows = grid.childNodes[1];
	
	// Reset (clean) all grid rows
	for(var i=1; i<rows.childNodes.length-1; i++) {
		rows.childNodes[i].style.backgroundColor = null;
		rows.childNodes[i].style.backgroundImage = null;
	}
	
	// Adjust number of rows
	var gridHeight = Math.max(grid.clientHeight - (rows.childNodes[0].clientHeight *2), 0);
	grid._gridHeight = gridHeight;
	
	var num_rows = Math.max(Math.ceil(gridHeight / ROWS_MULTIPLIER), ROWS_MINIMUM);
	while(rows.childNodes.length -2 > num_rows) {
		rows.removeChild(rows.childNodes[1]);
	}
	while(rows.childNodes.length -2 < num_rows) {
		var newNode = rows.childNodes[1].cloneNode(true);
		rows.insertBefore(newNode, rows.lastChild);
	}
	
	removeAttribute(grid, 'noGridSpacers');
	
	// Fix for non-html files (e.g. xml files)
	// I don't remember why I put !gBrowser.mCurrentBrowser in here... it may have happened sometime
	if(!contentDocument
	|| !contentDocument.getElementsByTagName('html')[0]
	|| !contentDocument.getElementsByTagName('body')[0]
	|| !gBrowser.mCurrentBrowser) {
		return false;
	}
	
	var fullHTMLHeight = contentDocument.getElementsByTagName('html')[0].scrollHeight || contentDocument.getElementsByTagName('body')[0].scrollHeight;
	
	// Don't think this can happen but I better make sure
	if(fullHTMLHeight == 0) { return false; }
	
	return true;
};

this.fillHighlightGrid = function(toAdd) {
	// I had checks for this before, if it reaches this point this shouldn't error but I'm preventing it anyway
	try {
		var scrollTop = contentDocument.getElementsByTagName('html')[0].scrollTop || contentDocument.getElementsByTagName('body')[0].scrollTop;
		var scrollTopMax = contentDocument.getElementsByTagName('html')[0].scrollTopMax || contentDocument.getElementsByTagName('body')[0].scrollTopMax;
		var fullHTMLHeight = contentDocument.getElementsByTagName('html')[0].scrollHeight || contentDocument.getElementsByTagName('body')[0].scrollHeight;
		var gridHeight = grid._gridHeight;
	}
	catch(ex) { return; }
	
	for(var i=0; i<toAdd.length; i++) {
		var aRange = toAdd[i].node;
		var rect = aRange.getBoundingClientRect();
		var absTop = (rect.top + scrollTop) / fullHTMLHeight;
		var absBot = (rect.bottom + scrollTop) / fullHTMLHeight;
		
		var highlighted = false;
		var row_bottom = 0;
		var rows = grid.childNodes[1];
		for(var j=1; j<rows.childNodes.length-1; j++) {
			var row = rows.childNodes[j];
			var row_top = row_bottom;
			var row_bottom = row_top + (row.clientHeight / gridHeight);
			
			// If any part of the row's range is within the match's range, highlight it
			if( (absTop >= row_top || absBot >= row_top) && (absTop <= row_bottom || absBot <= row_bottom) ) {
				row.style.backgroundColor = prefAid.highlightColor;
				if(toAdd[i].pattern) {
					row.style.backgroundImage = 'url("chrome://findbartweak/skin/pattern.gif")';
				}
				highlighted = true;
			}
			
			// Don't cycle through the whole grid unnecessarily
			else if(highlighted) {
				break;
			}
		}
	}
	
	if(scrollTopMax == 0) {
		setAttribute(grid, 'noGridSpacers', true);
	}
};

this.toggleGrid = function() {
	if(!prefAid.useGrid || UNLOADED) {
		for(var t=0; t<gBrowser.mTabs.length; t++) {
			var panel = $(gBrowser.mTabs[t].linkedPanel);
			var innerGrid = panel.querySelectorAll('[anonid="gridBox"]');
			if(innerGrid.length > 0) {
				innerGrid[0].parentNode.removeChild(innerGrid[0]);
			}
		}
	}
		
	if(!UNLOADED) {
		observerAid.notify('ReHighlightAll');
	}
};

moduleAid.LOADMODULE = function() {
	this.backups = {
		_highlightDoc: gFindBar._highlightDoc
	};
	
	// Add found words to counter and grid arrays if needed,
	// Modified to more accurately handle frames
	gFindBar._highlightDoc = function _highlightDoc(aHighlight, aWord, aWindow, aLevel) {
		if(!aWindow && !aLevel) {
			linkedPanel._counterHighlights = null;
			if(prefAid.useCounter) {
				var counterLevels = [];
				aLevel = counterLevels;
			}
			
			var fillGrid = false;
			if(prefAid.useGrid) {
				var toAddtoGrid = [];
				fillGrid = resetHighlightGrid();
			}
		}
			
		if(aLevel) {
			aLevel.push({ highlights: [], levels: [] });
			var thisLevel = aLevel.length -1;
		}
		
		var win = aWindow || this.browser.contentWindow;
		var textFound = false;
		for(var i = 0; win.frames && i < win.frames.length; i++) {
			var nextLevel = null;
			if(aLevel) { nextLevel = aLevel[thisLevel].levels; }
			
			if(this._highlightDoc(aHighlight, aWord, win.frames[i], nextLevel)) {
				textFound = true;
				if(aHighlight && fillGrid && !aWindow) {
					fillGrid = (toAddtoGrid.push({ node: win.frames[i].frameElement, pattern: true }) <= prefAid.gridLimit);
				}
			}
			
			if(aLevel) { aLevel[thisLevel].levels = nextLevel; }
		}
		
		var controller = this._getSelectionController(win);
		if(!controller) {
			// Without the selection controller,
			// we are unable to (un)highlight any matches
			return textFound;
		}
		
		var doc = win.document;
		if(!doc || !(doc instanceof window.HTMLDocument) || !doc.body) {
			return textFound;
		}
		
		if(aHighlight || aLevel) {
			var searchRange = doc.createRange();
			searchRange.selectNodeContents(doc.body);
			
			var startPt = searchRange.cloneRange();
			startPt.collapse(true);
			
			var endPt = searchRange.cloneRange();
			endPt.collapse(false);
			
			var retRange = null;
			var finder = Components.classes['@mozilla.org/embedcomp/rangefind;1'].createInstance().QueryInterface(Components.interfaces.nsIFind);
			finder.caseSensitive = this._shouldBeCaseSensitive(aWord);
			
			while((retRange = finder.Find(aWord, searchRange, startPt, endPt))) {
				startPt = retRange.cloneRange();
				startPt.collapse(false);
				textFound = true;
				
				if(aHighlight) {
					this._highlight(retRange, controller);
				
					if(fillGrid && !aWindow) {
						var editableNode = this._getEditableNode(retRange.startContainer);
						if(editableNode) {
							fillGrid = (toAddtoGrid.push({ node: editableNode, pattern: true }) <= prefAid.gridLimit);
						} else {
							fillGrid = (toAddtoGrid.push({ node: retRange }) <= prefAid.gridLimit);
						}
					}
				}
				
				if(aLevel) {
					aLevel[thisLevel].highlights.push({
						contentWindow: win,
						startContainer: retRange.startContainer,
						startOffset: retRange.startOffset,
						endContainer: retRange.endContainer,
						endOffset: retRange.endOffset
					});
				}
			}
		}
		
		if(!aWindow && aLevel && aLevel == counterLevels) {
			var counterHighlights = [];
			moveHighlightsArray(counterLevels, counterHighlights);
			linkedPanel._counterHighlights = counterHighlights;
		}
		
		if(!aWindow && fillGrid) {
			fillHighlightGrid(toAddtoGrid);
		}
		
		if(!aHighlight) {
			// First, attempt to remove highlighting from main document
			var sel = controller.getSelection(this._findSelection);
			sel.removeAllRanges();
			
			// Next, check our editor cache, for editors belonging to this
			// document
			if(this._editors) {
				for(var x = this._editors.length - 1; x >= 0; --x) {
					if(this._editors[x].document == doc) {
						sel = this._editors[x].selectionController.getSelection(this._findSelection);
						sel.removeAllRanges();
						// We don't need to listen to this editor any more
						this._unhookListenersAtIndex(x);
					}
				}
			}
		}
		return textFound;
	}
	
	prefAid.listen('useCounter', toggleCounter);
	prefAid.listen('useGrid', toggleGrid);
	
	toggleCounter();
	toggleGrid();
};

moduleAid.UNLOADMODULE = function() {
	prefAid.unlisten('useCounter', toggleCounter);
	prefAid.unlisten('useGrid', toggleGrid);
	
	toggleGrid();
	toggleCounter();
	
	// Clean up everything this module may have added to tabs and panels and documents
	for(var t=0; t<gBrowser.mTabs.length; t++) {
		var panel = $(gBrowser.mTabs[t].linkedPanel);
		delete panel._counterHighlights;
		delete panel._currentHighlight;
	}
	
	if(this.backups) {
		gFindBar._highlightDoc = this.backups._highlightDoc;
		delete this.backups;
	}
};
