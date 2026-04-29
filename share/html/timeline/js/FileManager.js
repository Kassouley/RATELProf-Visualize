const IS_LOCAL = location.protocol === 'file:';

class FileManager {
    constructor({
        folderButton,
        path = "./",
        handleFile,
    } = {}) {
        this.path = path
        this.folderName = path.split('/').pop();
        this.handleFile = handleFile;
        this.fileMapforLocal = {};
        this.readyToLoad = !IS_LOCAL;
        if (IS_LOCAL) 
            this.createFolderButton(document.getElementById(folderButton));
    }

    onFolderSelect(callback) {
        this.onFolderSelect = callback;
    }

    async openFile(filename) {
        if (!this.readyToLoad) return;
        
        try {
            let file;

            const start = performance.now();
            if (IS_LOCAL) {
                file = this.fileMapforLocal[filename];
            } else { // IS_SERVER
                const res = await fetch(`${this.path}/${filename}`);
                if (res.ok) file = await res.blob();
            }
            const end = performance.now();
            console.log(`[openFile] ${filename} load time: ${(end - start).toFixed(2)} ms`);

            if (!file) throw new Error(`File ${filename} not found`);

            this.handleFile(file);
        } catch (err) {
            alert('Error fetching file: ' + err.message);
            console.error(err);
        }
    }


    createFolderButton(container) {
        container.style.display = "block"; 
        
        const input = document.createElement("input");
        input.type = "file";
        input.id = "folder-picker";
        input.multiple = true;
        input.style.display = "none";
        input.setAttribute("webkitdirectory", "");
        input.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (!files.length) return;

            // Check folder name
            const folderPath = files[0].webkitRelativePath.split('/')[0];
            if (folderPath !== this.folderName) {
                alert(`Selected folder does not match expected folder: "${this.folderName}" got "${folderPath}"`);
                return;
            }

            files.forEach(file => {
                this.fileMapforLocal[file.name] = file;
            });

            this.readyToLoad = true;
            this.onFolderSelect();
            container.innerHTML = '';
        });

        const button = document.createElement('button');
        button.textContent = 'Select Folder';
        button.addEventListener('click', () => input.click());

        const text = document.createElement('p');
        text.innerHTML = `You are running in <strong>local mode (file:)</strong>.<br>
            Due to browser security restriction, to load trace data, you must manually select the folder containing the files and grant access.<br>
            Please select the folder named <strong>${this.path}</strong>.<br><br>
            In <strong>server mode</strong>, this step is not required.`

        container.appendChild(text);
        container.appendChild(input);
        container.appendChild(button);

    }
}