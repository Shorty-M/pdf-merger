document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let pages = []; // Array of page objects
    /* Page Object Structure:
        {
            id: string,
            fileRef: File,
            originalPageIndex: number, (0-indexed)
            rotation: number, (0, 90, 180, 270)
            thumbnailUrl: string,
            originalFilename: string
        }
    */

    // --- DOM Elements ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileListSection = document.getElementById('file-list-section');
    const pageGridElement = document.getElementById('page-grid');
    const fileCountElement = document.getElementById('file-count');
    const clearBtn = document.getElementById('clear-btn');
    const mergeBtn = document.getElementById('merge-btn');
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');

    // --- Initialization ---
    // Initialize SortableJS
    let sortable = new Sortable(pageGridElement, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: (evt) => {
            // Reorder internal array correctly
            const movedItem = pages.splice(evt.oldIndex, 1)[0];
            pages.splice(evt.newIndex, 0, movedItem);
        }
    });

    // --- Event Listeners ---
    fileInput.addEventListener('change', handleFileSelect);

    dropZone.addEventListener('click', (e) => {
        if (e.target.tagName !== 'LABEL' && e.target.tagName !== 'INPUT') {
            fileInput.click();
        }
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', handleDrop, false);

    clearBtn.addEventListener('click', clearFiles);
    mergeBtn.addEventListener('click', mergePDFs);

    // --- Functions ---
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const droppedFiles = dt.files;
        addFiles(droppedFiles);
    }

    function handleFileSelect(e) {
        const selectedFiles = e.target.files;
        addFiles(selectedFiles);
        fileInput.value = '';
    }

    async function addFiles(fileList) {
        const newFiles = Array.from(fileList).filter(file => file.type === 'application/pdf');

        if (newFiles.length === 0) {
            alert('Please select valid PDF files.');
            return;
        }

        showLoading(true, "Extracting pages...");

        try {
            for (const file of newFiles) {
                const arrayBuffer = await file.arrayBuffer();
                // Load the document using PDF.js
                const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
                const pdfjsDoc = await loadingTask.promise;

                // Extract all pages
                for (let i = 1; i <= pdfjsDoc.numPages; i++) {
                    const page = await pdfjsDoc.getPage(i);
                    // Generate a thumbnail (lower resolution for performance)
                    const viewport = page.getViewport({ scale: 0.5 });
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    await page.render({ canvasContext: ctx, viewport }).promise;

                    pages.push({
                        id: 'page-' + Math.random().toString(36).substr(2, 9),
                        fileRef: file,
                        originalPageIndex: i - 1, // 0-indexed for pdf-lib
                        rotation: 0,
                        thumbnailUrl: canvas.toDataURL(),
                        originalFilename: file.name
                    });
                }
            }
        } catch (err) {
            console.error("Error reading PDF:", err);
            alert("Error reading one of the PDF files. It might be corrupted or password-protected.");
        }

        updateUI();
        showLoading(false);
    }

    function removePage(id) {
        pages = pages.filter(p => p.id !== id);
        updateUI();
    }

    function rotatePage(id) {
        const page = pages.find(p => p.id === id);
        if (page) {
            page.rotation = (page.rotation + 90) % 360;
            // Visually update only this specific DOM element without re-rendering everything
            const imgEl = document.querySelector(`.page-thumbnail[data-id="${id}"]`);
            if (imgEl) {
                imgEl.style.transform = `rotate(${page.rotation}deg)`;
            }
        }
    }

    function clearFiles() {
        pages = [];
        updateUI();
    }

    function updateUI() {
        // Update grid
        pageGridElement.innerHTML = '';

        pages.forEach((page, index) => {
            const el = document.createElement('div');
            el.className = 'page-card';
            el.setAttribute('data-id', page.id);

            el.innerHTML = `
                <img src="${page.thumbnailUrl}" class="page-thumbnail" data-id="${page.id}" 
                     style="transform: rotate(${page.rotation}deg)" alt="Page ${index + 1}">
                <div class="page-index-badge">${index + 1}</div>
                <div class="file-name-tooltip">${page.originalFilename} - Page ${page.originalPageIndex + 1}</div>
                
                <div class="page-controls">
                    <button class="control-btn rotate-btn" data-action="rotate" data-id="${page.id}" title="Rotate 90°">
                        <i class="fa-solid fa-rotate-right"></i>
                    </button>
                    <button class="control-btn remove-btn" data-action="remove" data-id="${page.id}" title="Remove Page">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            `;

            pageGridElement.appendChild(el);
        });

        // Add event listeners to controls
        document.querySelectorAll('.page-controls .control-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.currentTarget.getAttribute('data-action');
                const id = e.currentTarget.getAttribute('data-id');

                if (action === 'rotate') {
                    rotatePage(id);
                } else if (action === 'remove') {
                    removePage(id);
                }
            });
        });

        // Update Visibility & Count
        if (pages.length > 0) {
            fileListSection.classList.remove('hidden');
            fileCountElement.textContent = `${pages.length} page${pages.length !== 1 ? 's' : ''}`;
        } else {
            fileListSection.classList.add('hidden');
        }

        // Disable merge button if less than 1 page
        if (pages.length === 0) {
            mergeBtn.disabled = true;
            mergeBtn.style.opacity = '0.5';
            mergeBtn.style.cursor = 'not-allowed';
            mergeBtn.title = "Add at least one page to merge";
        } else {
            mergeBtn.disabled = false;
            mergeBtn.style.opacity = '1';
            mergeBtn.style.cursor = 'pointer';
            mergeBtn.title = "Save Merged Document";
        }
    }

    async function mergePDFs() {
        if (pages.length === 0) return;

        try {
            showLoading(true, "Generating final PDF...");

            const { PDFDocument, Math } = window.PDFLib;
            const mergedPdf = await PDFDocument.create();

            // Optimization: Cache loaded pdf-lib documents so we don't reload the same file for every page
            const cachedDocs = new Map(); // File -> PDFDocument

            let currentProcessingIndex = 0;

            for (const pageObj of pages) {
                currentProcessingIndex++;
                loadingText.textContent = `Processing page ${currentProcessingIndex} of ${pages.length}...`;

                let sourceDoc = cachedDocs.get(pageObj.fileRef);

                // Load original PDF if it isn't loaded yet
                if (!sourceDoc) {
                    const srcBuffer = await pageObj.fileRef.arrayBuffer();
                    sourceDoc = await PDFDocument.load(srcBuffer);
                    cachedDocs.set(pageObj.fileRef, sourceDoc);
                }

                // Copy specific page
                const [copiedPage] = await mergedPdf.copyPages(sourceDoc, [pageObj.originalPageIndex]);

                // Apply rotation if any
                if (pageObj.rotation !== 0) {
                    // pdf-lib requires degrees object
                    const rotationDegrees = window.PDFLib.degrees(pageObj.rotation);
                    copiedPage.setRotation(rotationDegrees);
                }

                mergedPdf.addPage(copiedPage);
            }

            // Serialize
            loadingText.textContent = "Finalizing document...";
            const mergedPdfBytes = await mergedPdf.save();

            // Trigger download
            downloadBlob(mergedPdfBytes, 'merged-document.pdf', 'application/pdf');

            showLoading(false);

        } catch (error) {
            console.error("Error merging PDFs:", error);
            alert("An error occurred while merging the PDFs.");
            showLoading(false);
        }
    }

    async function downloadBlob(bytes, defaultFilename, mimeType) {
        try {
            if ('showSaveFilePicker' in window) {
                const options = {
                    suggestedName: defaultFilename,
                    types: [{
                        description: 'PDF Document',
                        accept: { [mimeType]: ['.pdf'] },
                    }],
                };

                const fileHandle = await window.showSaveFilePicker(options);
                const writable = await fileHandle.createWritable();
                await writable.write(bytes);
                await writable.close();
            } else {
                fallbackDownload(bytes, defaultFilename, mimeType);
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error("Failed to save file:", err);
                fallbackDownload(bytes, defaultFilename, mimeType);
            } else {
                console.log("Save operation cancelled by user.");
            }
        }
    }

    function fallbackDownload(bytes, filename, mimeType) {
        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 100);
    }

    function showLoading(show, text = 'Merging PDFs...') {
        loadingText.textContent = text;
        if (show) {
            loadingOverlay.classList.remove('hidden');
        } else {
            loadingOverlay.classList.add('hidden');
        }
    }
});
