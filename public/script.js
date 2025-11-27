let currentEditId = null;

async function loadFiles() {
    const res = await fetch('/api/files');
    const files = await res.json();
    const tbody = document.getElementById('fileList');
    tbody.innerHTML = '';

    files.forEach(file => {
        // Determine if editable (Text, HTML, JSON, JS, CSS)
        const isEditable = file.mimetype && file.mimetype.match(/text|json|javascript|xml/);
        
        const sizeKB = (file.size / 1024).toFixed(2);
        
        // Shorten the MongoDB ObjectId for display
        const shortId = file.id.substring(0, 8) + '...';

        const row = `
            <tr>
                <td title="${file.id}">${shortId}</td>
                <td>${file.filename}</td>
                <td><small>${file.mimetype}</small></td>
                <td>${sizeKB} KB</td>
                <td class="actions">
                    <button class="btn-dl" onclick="window.open('/api/file/${file.id}')">Download/View</button>
                    ${isEditable ? `<button class="btn-edit" onclick="openEditor('${file.id}')">Edit</button>` : ''}
                    <button class="btn-del" onclick="deleteFile('${file.id}')">Delete</button>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

async function deleteFile(id) {
    if(!confirm("Are you sure you want to delete this file permanently?")) return;
    await fetch(`/api/file/${id}`, { method: 'DELETE' });
    loadFiles();
}

async function openEditor(id) {
    const res = await fetch(`/api/edit/${id}`);
    const data = await res.json();
    
    currentEditId = id;
    document.getElementById('editFileName').innerText = "Editing: " + data.filename;
    document.getElementById('codeEditor').value = data.content;
    document.getElementById('editorModal').classList.remove('hidden');
}

function closeEditor() {
    document.getElementById('editorModal').classList.add('hidden');
    currentEditId = null;
}

async function saveFile() {
    if(!currentEditId) return;
    
    const content = document.getElementById('codeEditor').value;
    
    await fetch(`/api/edit/${currentEditId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content })
    });
    
    closeEditor();
    alert("Saved!");
    loadFiles();
}

// Load initially
loadFiles();
