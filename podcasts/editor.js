document.addEventListener('DOMContentLoaded', () => {
    // DOM Element References
    const jsonSelector = document.getElementById('json-selector');
    const editorForm = document.getElementById('editor-form');
    const previewFrame = document.getElementById('preview-frame');
    const downloadBtn = document.getElementById('download-btn');
    const saveBtn = document.getElementById('save-btn');
    const statusMessage = document.getElementById('status-message');

    // State
    let currentData = null;
    let currentFilename = '';
    const slideLayouts = ['classic_bullet_point', 'title', 'table_of_content', 'quote', 'reflective_question', 'a_vs_b', 'only_image', 'only_text', 'quiz'];

    function renderEditor() {
        editorForm.innerHTML = '';
        if (!currentData || !currentData.entries) {
            editorForm.innerHTML = '<p style="color: #fc8181;">Invalid or empty JSON data.</p>';
            return;
        }

        currentData.entries.forEach((entry, index) => {
            const card = document.createElement('div');
            card.className = 'entry-card';
            const entryType = entry.layout || entry.type || 'classic_bullet_point';

            const title = document.createElement('h3');
            title.textContent = `Entry ${index + 1}: ${entry.concept || entryType}`;
            card.appendChild(title);

            card.appendChild(createFormGroup('layout', 'Layout', entryType, index, 'select'));
            
            if (entryType !== 'quiz') {
                 card.appendChild(createFormGroup('timestamp', 'Timestamp', entry.timestamp, index));
            }
            card.appendChild(createFormGroup('concept', 'Concept / TOC Title', entry.concept, index));

            switch (entryType) {
                case 'title':
                    card.appendChild(createFormGroup('explanation', 'Main Title', entry.explanation, index, 'textarea'));
                    card.appendChild(createFormGroup('slide_content', 'Subtitle', entry.slide_content, index, 'textarea'));
                    break;
                case 'table_of_content':
                    card.appendChild(createFormGroup('explanation', 'Heading', entry.explanation, index));
                    card.appendChild(createFormGroup('slide_content', 'List (one item per line)', entry.slide_content, index, 'textarea'));
                    break;
                case 'quote':
                    card.appendChild(createFormGroup('explanation', 'Quote Text', entry.explanation, index, 'textarea'));
                    card.appendChild(createFormGroup('slide_content', 'Source', entry.slide_content, index));
                    break;
                case 'reflective_question':
                    card.appendChild(createFormGroup('explanation', 'Question Text', entry.explanation, index, 'textarea'));
                    break;
                case 'a_vs_b':
                    card.appendChild(createFormGroup('explanation', 'Slide Heading', entry.explanation, index));
                    card.appendChild(createFormGroup('slide_content', 'Content (use "---" to separate)', entry.slide_content, index, 'textarea'));
                    break;
                case 'only_text':
                    card.appendChild(createFormGroup('slide_content', 'Text Content', entry.slide_content, index, 'textarea'));
                    break;
                case 'quiz':
                    const quizInfo = document.createElement('p');
                    quizInfo.textContent = `Quiz: "${entry.question}" (not editable).`;
                    card.appendChild(quizInfo);
                    break;
                case 'only_image':
                case 'classic_bullet_point':
                default:
                    card.appendChild(createFormGroup('explanation', 'Explanation', entry.explanation, index, 'textarea'));
                    card.appendChild(createFormGroup('slide_content', 'Slide Content', entry.slide_content, index, 'textarea'));
                    break;
            }

            const needsImage = ['classic_bullet_point', 'only_image'].includes(entryType);
            if (needsImage) {
                card.appendChild(createFormGroup('image_filename', 'Image Filename', entry.image_filename, index));
                card.appendChild(createImageUploadGroup(index, entry.image_filename));
            }
            
            editorForm.appendChild(card);
        });
    }

    function createFormGroup(key, labelText, value, index, type = 'text') {
        const group = document.createElement('div');
        group.className = 'form-group';
        const label = document.createElement('label');
        label.textContent = labelText;
        group.appendChild(label);
        
        let input;
        if (type === 'textarea') {
            input = document.createElement('textarea');
            input.rows = 4;
        } else if (type === 'select') {
            input = document.createElement('select');
            slideLayouts.forEach(st => {
                const option = document.createElement('option');
                option.value = st;
                option.textContent = st.replace(/_/g, ' ');
                if (st === value) option.selected = true;
                input.appendChild(option);
            });
            input.addEventListener('change', handleTypeChange);
        } else {
            input = document.createElement('input');
            input.type = 'text';
        }

        input.value = value || '';
        input.dataset.index = index;
        input.dataset.key = key;
        input.id = `input-${index}-${key}`;
        if (type !== 'select') {
            input.addEventListener('input', handleInputChange);
        }
        group.appendChild(input);
        return group;
    }

    function createImageUploadGroup(index, currentFilename) {
        const uploadGroup = document.createElement('div');
        uploadGroup.className = 'image-upload-group';
        const uploadLabel = document.createElement('label');
        uploadLabel.textContent = 'Upload New Image';
        uploadGroup.appendChild(uploadLabel);
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/png, image/jpeg, image/gif';
        fileInput.dataset.index = index;
        fileInput.addEventListener('change', handleImageUpload);
        uploadGroup.appendChild(fileInput);
        const uploadStatus = document.createElement('span');
        uploadStatus.className = 'upload-status';
        uploadGroup.appendChild(uploadStatus);
        return uploadGroup;
    }

    function handleTypeChange(event) {
        const { index } = event.target.dataset;
        const newType = event.target.value;
        currentData.entries[index].layout = newType;
        delete currentData.entries[index].type; // Clean up old key
        renderEditor();
        updatePreview();
    }

    async function handleImageUpload(event) {
        const fileInput = event.target;
        const file = fileInput.files[0];
        const index = fileInput.dataset.index;
        const statusEl = fileInput.nextElementSibling;

        if (!file) return;

        // Get the target filename from the corresponding input field
        let targetFilename = document.getElementById(`input-${index}-image_filename`).value;
        if (!targetFilename) {
            // If no filename is set, create one from the uploaded file's name
            targetFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            // Update the data model and the UI
            document.getElementById(`input-${index}-image_filename`).value = targetFilename;
            currentData.entries[index].image_filename = targetFilename;
        }

        statusEl.textContent = 'Uploading...';
        const presentationId = currentFilename.replace('.json', '');
        const formData = new FormData();
        formData.append('image_file', file);
        formData.append('presentation_id', presentationId);
        formData.append('target_filename', targetFilename); // Send the correct filename

        try {
            const response = await fetch('/upload-image', { method: 'POST', body: formData });
            const result = await response.json();
            if (response.ok) {
                statusEl.textContent = 'Success!';
                statusEl.className = 'upload-status success';
                previewFrame.src = `index.html?cache_bust=${Date.now()}`;
            } else {
                throw new Error(result.message || 'Upload failed.');
            }
        } catch (error) {
            statusEl.textContent = `Error: ${error.message}`;
            statusEl.className = 'upload-status error';
        }
        setTimeout(() => { statusEl.textContent = ''; }, 5000);
    }

    async function populateSelector() {
        try {
            const response = await fetch(`json/_file_list.json?cache_bust=${Date.now()}`);
            if (!response.ok) throw new Error('Could not fetch file list');
            const fileList = await response.json();
            jsonSelector.innerHTML = '';
            fileList.forEach(filename => {
                const option = document.createElement('option');
                option.value = filename;
                option.textContent = filename;
                jsonSelector.appendChild(option);
            });
            if (fileList.length > 0) {
                await loadJsonFile(fileList[0]);
            }
        } catch (error) {
            console.error('Error loading file list:', error);
            editorForm.innerHTML = `<p style="color: #fc8181;">${error.message}</p>`;
        }
    }

    async function loadJsonFile(filename) {
        try {
            currentFilename = filename;
            const response = await fetch(`json/${filename}?cache_bust=${Date.now()}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            currentData = await response.json();
            renderEditor();
            updatePreview();
        } catch (error) {
            console.error(`Error loading ${filename}:`, error);
            editorForm.innerHTML = `<p style="color: #fc8181;">Could not load ${filename}.</p>`;
        }
    }

    function handleInputChange(event) {
        const { index, key } = event.target.dataset;
        currentData.entries[index][key] = event.target.value;
        updatePreview();
    }

    function updatePreview() {
        if (previewFrame.contentWindow && currentData) {
            previewFrame.contentWindow.postMessage({
                type: 'loadData',
                data: currentData,
                id: currentFilename.replace('.json', '')
            }, '*');
        }
    }
    
    function downloadJson() {
        if (!currentData) return;
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentData, null, 2));
        const a = document.createElement('a');
        a.setAttribute("href", dataStr);
        a.setAttribute("download", currentFilename);
        a.click();
        a.remove();
    }

    async function saveJsonToServer() {
        if (!currentData || !currentFilename) return;
        statusMessage.textContent = 'Saving...';
        statusMessage.className = '';
        try {
            const response = await fetch('/save-json', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: currentFilename, content: currentData }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Failed to save file.');
            statusMessage.textContent = 'Saved successfully!';
            statusMessage.className = 'success';
        } catch (error) {
            statusMessage.textContent = `Error: ${error.message}`;
            statusMessage.className = 'error';
        }
        setTimeout(() => { statusMessage.textContent = ''; statusMessage.className = ''; }, 4000);
    }

    jsonSelector.addEventListener('change', (e) => loadJsonFile(e.target.value));
    downloadBtn.addEventListener('click', downloadJson);
    saveBtn.addEventListener('click', saveJsonToServer);
    previewFrame.addEventListener('load', () => { if (currentData) { updatePreview(); } });

    populateSelector();
});