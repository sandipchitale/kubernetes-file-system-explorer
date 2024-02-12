'use strict';

import * as vscode from 'vscode';
import * as k8s from 'vscode-kubernetes-tools-api';
import { platform } from 'os';
import * as path from 'path';

const KUBERNETES_FILE_VIEW = 'kubernetes-file-view';
const KUBERNETES_FOLDER_FIND = 'kubernetes-folder-find';
const KUBERNETES_FOLDER_LS_AL = 'kubernetes-folder-ls-al';

class VolumeNode implements k8s.ClusterExplorerV1.Node {
    private podName: string;
    private namespace: string;
    private volume: any;

    constructor(podName: string, namespace: string, volume: any) {
        this.podName = podName;
        this.namespace = namespace;
        this.volume = volume;
    }

    async getChildren(): Promise<k8s.ClusterExplorerV1.Node[]> {
        return [];
    }

    getTreeItem(): vscode.TreeItem {
        const ephemeral = !!(this.volume.configMap) || !!(this.volume.downwardAPI) || !!(this.volume.empyDir) || !!(this.volume.ephemeral) || !!(this.volume.projected) || !!(this.volume.secret) ;
        const treeItem = new vscode.TreeItem(`${ephemeral  ? 'Ephemeral ': ''}Volume: ${this.volume.name}`, vscode.TreeItemCollapsibleState.None);
        treeItem.tooltip = JSON.stringify(this.volume, null, '  ');
        treeItem.contextValue = 'volumenode';
        treeItem.iconPath = new vscode.ThemeIcon('database');
        return treeItem;
    }
}

class VolumeMountNode implements k8s.ClusterExplorerV1.Node {
    private podName: string;
    private namespace: string;
    private volumeMount: any;

    constructor(podName: string, namespace: string, volumeMount: any) {
        this.podName = podName;
        this.namespace = namespace;
        this.volumeMount = volumeMount;
    }

    async getChildren(): Promise<k8s.ClusterExplorerV1.Node[]> {
        return [];
    }

    getTreeItem(): vscode.TreeItem {
        const treeItem = new vscode.TreeItem('Volume mount: ' + this.volumeMount.name, vscode.TreeItemCollapsibleState.None);
        treeItem.tooltip = JSON.stringify(this.volumeMount, null, '  ');
        treeItem.contextValue = 'volumemountnode';
        treeItem.iconPath = new vscode.ThemeIcon('layers');
        return treeItem;
    }
}

class ContainerStatusNode implements k8s.ClusterExplorerV1.Node {
    private podName: string;
    private containerName: string;
    private namespace: string;
    private status: any;
    private state: any;

    constructor(podName: string, containerName: string, namespace: string, status: any, state: any) {
        this.podName = podName;
        this.containerName = containerName;
        this.namespace = namespace;
        this.status = status;
        this.state = state;
    }

    async getChildren(): Promise<k8s.ClusterExplorerV1.Node[]> {
        return [];
    }

    getTreeItem(): vscode.TreeItem {
        const treeItem = new vscode.TreeItem('Status: ' + this.status, vscode.TreeItemCollapsibleState.None);
        treeItem.tooltip = JSON.stringify(this.status, null, '  ');
        treeItem.contextValue = 'containernodestatus';
        if (this.state.running) {
            treeItem.iconPath = new vscode.ThemeIcon('pass');
        } else {
            treeItem.iconPath = new vscode.ThemeIcon('error');
        }
        return treeItem;
    }
}

class ContainerNode implements k8s.ClusterExplorerV1.Node {
    private kubectl: k8s.KubectlV1;
    podName: string;
    namespace: string;
    name: string;
    private image: string;
    private initContainer: boolean;
    private volumeMounts: any;
    private status: string;
    private state: any;

    constructor(kubectl:  k8s.KubectlV1, podName: string, namespace: string, name: string, image: string, initContainer: boolean, volumeMounts: any, status: string, state: any) {
        this.kubectl = kubectl;
        this.podName = podName;
        this.namespace = namespace;
        this.name = name;
        this.image = image;
        this.initContainer = initContainer;
        this.volumeMounts = volumeMounts;
        this.status = status;
        this.state = state;
    }

    async getChildren(): Promise<k8s.ClusterExplorerV1.Node[]> {
        const statusNode = new ContainerStatusNode(this.podName, this.name, this.namespace, this.status, this.state)
        const volumeMountNodes = [];
        if (this.volumeMounts && this.volumeMounts.length > 0) {
            this.volumeMounts.forEach((volumeMount) => {
                volumeMountNodes.push(new VolumeMountNode(this.name, this.namespace, volumeMount));
            })
        }
        return [statusNode, ...volumeMountNodes];
    }

    getTreeItem(): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(`${this.initContainer ? 'Init Container:' : 'Container: ' } ${this.name} ( Image: ${this.image } )`,
            (this.volumeMounts && this.volumeMounts.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None));
        treeItem.tooltip = `${this.initContainer ? 'Init Container:' : 'Container: ' } ${this.name} ( Image: ${this.image } )`;
        treeItem.contextValue = 'containernode';
        let iconPath: typeof treeItem.iconPath = new vscode.ThemeIcon('package');
        if (this.state.running) {
            iconPath = vscode.Uri.file(path.join(vscode.extensions.getExtension('ms-kubernetes-tools.vscode-kubernetes-tools').extensionPath, 'images', 'runningPod.svg'));
        } else {
            iconPath = vscode.Uri.file(path.join(vscode.extensions.getExtension('ms-kubernetes-tools.vscode-kubernetes-tools').extensionPath, 'images', 'errorPod.svg'));
        }
        treeItem.iconPath = iconPath;
        return treeItem;
    }
}

class FolderNode implements k8s.ClusterExplorerV1.Node {
    private kubectl: k8s.KubectlV1;
    podName: string;
    namespace: string;
    containerName: string;
    path: string;
    name: string;
    volumeMounts: Array<any>;

    constructor(kubectl:  k8s.KubectlV1, podName: string, namespace: string, path: string, name: string, containerName: string, volumeMounts: Array<any>) {
        this.kubectl = kubectl;
        this.podName = podName;
        this.namespace = namespace;
        this.containerName = containerName;
        this.path = path;
        this.name = name;
        this.volumeMounts = volumeMounts;
    }

    async getChildren(): Promise<k8s.ClusterExplorerV1.Node[]> {
        const lsResult = await this.kubectl.invokeCommand(`exec -it ${this.podName} ${this.containerName ? '-c ' + this.containerName : ''} --namespace ${this.namespace} -- ls -F ${this.path}${this.name}`);

        if (!lsResult || lsResult.code !== 0) {
            vscode.window.showErrorMessage(`Can't get resource usage: ${lsResult ? lsResult.stderr : 'unable to run kubectl'}`);
            return;
        }
        const lsCommandOutput = lsResult.stdout;
        if (lsCommandOutput.trim().length > 0) {
            const fileNames = lsCommandOutput.split('\n').filter((fileName) => fileName && fileName.trim().length > 0);
            return fileNames.map((fileName) => {
                if (fileName.endsWith('/')) {
                    return new FolderNode(this.kubectl, this.podName, this.namespace, this.path + this.name, fileName, this.containerName, this.volumeMounts);
                } else {
                    return new FileNode(this.podName, this.namespace, this.path+this.name, fileName, this.containerName, this.volumeMounts);
                }
            });
        }
        return [];
    }

    getTreeItem(): vscode.TreeItem {
        let label = this.name.trim().length > 0 ? this.name : (this.containerName ? this.containerName + ':' : '') + this.path;
        if (this.volumeMounts.indexOf(`${this.path}${this.name.substring(0, this.name.length - 1)}`) !== -1) {
            label += ` [Mounted]`
        }
        const treeItem = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
        treeItem.tooltip = label;
        treeItem.iconPath = vscode.ThemeIcon.Folder;
        treeItem.contextValue = 'containerfoldernode';
        return treeItem;
    }

    async findImpl(findArgs) {
        let doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(`${KUBERNETES_FOLDER_FIND}:${this.podName}:${this.namespace}:${this.containerName}:${this.path}${this.name}`));
        await vscode.window.showTextDocument(doc, { preview: false });
    }

    find() {
        let findArgs = '';
        this.findImpl(findArgs);
    }

    async lsDashAl() {
        let doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(`${KUBERNETES_FOLDER_LS_AL}:${this.podName}:${this.namespace}:${this.containerName}:${this.path}${this.name}`));
        await vscode.window.showTextDocument(doc, { preview: false });
    }
}

class FileNode implements k8s.ClusterExplorerV1.Node {
    podName: string;
    namespace: string;
    containerName: string;
    path: string;
    name: string;
    volumeMounts: Array<any>;

    constructor(podName: string, namespace: string, path: string, name: string, containerName: string, volumeMounts: Array<any>) {
        this.podName = podName;
        this.namespace = namespace;
        this.containerName = containerName;
        this.path = path;
        this.name = name
            .replace(/\@$/, '')
            .replace(/\*$/, '');
        this.volumeMounts = volumeMounts;
    }

    async getChildren(): Promise<k8s.ClusterExplorerV1.Node[]> {
        return [];
    }

    getTreeItem(): vscode.TreeItem {
        let label = this.name;
        if (this.volumeMounts.indexOf(`${this.path}${this.name}`) !== -1) {
            label += ` [Mounted]`
        }
        const treeItem = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        treeItem.tooltip = this.path + label;
        treeItem.iconPath = vscode.ThemeIcon.File;
        treeItem.contextValue = 'containerfilenode';
        return treeItem;
    }

    isFile() {
        return true;
    }

    async viewFile() {
        let doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(`kubernetes-file-view:${this.podName}:${this.namespace}:${this.containerName}:${this.path}${this.name}`));
        await vscode.window.showTextDocument(doc, { preview: false });
    }

    tailDashFFile() {
        const terminal = vscode.window.activeTerminal || vscode.window.createTerminal();
        terminal.show();
        terminal.sendText(`kubectl exec -it --namespace ${this.namespace} -c ${this.containerName} ${this.podName} -- tail -f ${this.path}${this.name}`);
    }
}

class FileSystemNodeContributor {
    private kubectl: k8s.KubectlV1;

    constructor(kubectl:  k8s.KubectlV1) {
        this.kubectl = kubectl;
    }

    contributesChildren(parent: k8s.ClusterExplorerV1.ClusterExplorerNode | undefined): boolean {
        return parent && parent.nodeType === 'resource' && parent.resourceKind.manifestKind === 'Pod';
    }

    async getChildren(parent: k8s.ClusterExplorerV1.ClusterExplorerNode | undefined): Promise<k8s.ClusterExplorerV1.Node[]> {
        if (parent && parent.nodeType === 'resource' && parent.resourceKind.manifestKind === 'Pod') {
            const explorer = await k8s.extension.clusterExplorer.v1;
            if (explorer.available) {
                const kubectl = await k8s.extension.kubectl.v1;
                if (kubectl.available) {
                    const podDetails = await kubectl.api.invokeCommand(`get pods ${parent.name} -n ${parent.namespace} -o json`);
                    if (podDetails && podDetails.stdout) {
                        const podDetailsAsJson = JSON.parse(podDetails.stdout);
                        const initContainerStatuses = {};
                        const initContainerStatusesDetails = await kubectl.api.invokeCommand(`get pods ${parent.name} -n ${parent.namespace} -o jsonpath='{.status.initContainerStatuses}'`)
                        if (initContainerStatusesDetails && initContainerStatusesDetails.stdout) {
                            try {
                                const initContainerStatusesJson = JSON.parse(initContainerStatusesDetails.stdout.replace(/^'/, '').replace(/'$/, ''));
                                initContainerStatusesJson.forEach((initContainerStatus) => {
                                    initContainerStatuses[initContainerStatus.name] = initContainerStatus;
                                });
                            } catch (er) {
                                // ignore
                            }
                        }

                        const containerStatuses = {};
                        const containerStatusesDetails = await kubectl.api.invokeCommand(`get pods ${parent.name} -n ${parent.namespace} -o jsonpath='{.status.containerStatuses}'`)
                        if (containerStatusesDetails && containerStatusesDetails.stdout) {
                            try {
                                const containerStatusesJson = JSON.parse(containerStatusesDetails.stdout.replace(/^'/, '').replace(/'$/, ''));
                                containerStatusesJson.forEach((containerStatus) => {
                                    containerStatuses[containerStatus.name] = containerStatus;
                                });
                            } catch (ex) {
                                // ignore
                            }
                        }

                        const volumes = [];
                        podDetailsAsJson.spec.volumes.forEach((volume) => {
                            volumes.push(new VolumeNode(parent.name, parent.namespace, volume));
                        });
                        const containers = [];
                        if (podDetailsAsJson.spec.initContainers) {
                            podDetailsAsJson.spec.initContainers.forEach((container) => {
                                let state = initContainerStatuses[container.name]?.state;
                                let status = '';
                                if (initContainerStatuses[container.name]?.state.running) {
                                    status = `Running (Started at: ${initContainerStatuses[container.name]?.state.running.startedAt})`;
                                } else if (initContainerStatuses[container.name]?.state.terminated) {
                                    status = initContainerStatuses[container.name]?.state.terminated?.reason;
                                }
                                // const containerStatus = await kubectl.api.invokeCommand(`get pods ${parent.name} -o json`)
                                containers.push(new ContainerNode(this.kubectl, parent.name, parent.namespace, container.name, container.image, true, container.volumeMounts, status, state));
                            });
                        }
                        podDetailsAsJson.spec.containers.forEach((container) => {
                            let state = containerStatuses[container.name]?.state;
                            let status = '';
                            if (containerStatuses[container.name]?.state.running) {
                                status = `Running (Started at: ${containerStatuses[container.name]?.state.running.startedAt})`;
                            } else if (containerStatuses[container.name]?.state.terminated) {
                                status = containerStatuses[container.name]?.state.terminated?.reason;
                            }
                            containers.push(new ContainerNode(this.kubectl, parent.name, parent.namespace, container.name, container.image, false, container.volumeMounts, status, state));
                        });
                        const containerFilesystems = [];
                        podDetailsAsJson.spec.containers.forEach((container) => {
                            const volumeMounts: Array<any> = [];
                            if (container.volumeMounts && container.volumeMounts.length > 0) {
                                container.volumeMounts.forEach((volumeMount) => {
                                    volumeMounts.push(volumeMount.mountPath);
                                });
                            }
                            containerFilesystems.push(new FolderNode(this.kubectl, parent.name, parent.namespace, '/', '', container.name, volumeMounts));
                        });
                        return [...volumes, ...containers, ...containerFilesystems];
                    }
                }
            }
        }
        return [];
    }
}

class KubernetesContainerFileDocumentProvider implements vscode.TextDocumentContentProvider {
    private kubectl: k8s.KubectlV1;

    constructor(kubectl:  k8s.KubectlV1) {
        this.kubectl = kubectl;
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const parts = uri.path.split(':');

        let command;
        let where = `Namespace: ${parts[1]} Pod: ${parts[0]} Container: ${parts[2]}`;
        if (uri.scheme === KUBERNETES_FILE_VIEW) {
            command = 'cat';
        } else if (uri.scheme === KUBERNETES_FOLDER_FIND) {
            command = 'find';
        } else if (uri.scheme === KUBERNETES_FOLDER_LS_AL) {
            command = 'ls -al';
        }
        if (command) {
            const result = await this.kubectl.invokeCommand(`exec -it ${parts[0]}  -c ${parts[2]} --namespace ${parts[1]} -- ${command} ${parts[3]}`);
            if (!result || result.code !== 0) {
                vscode.window.showErrorMessage(`Can't get data: ${result ? result.stderr : 'unable to run cat command on file ${this.path}${this.name}'}`);
                return `${command} ${uri.path}\n ${result.stderr}`;
            }
            return (uri.scheme === KUBERNETES_FILE_VIEW) ?  `${result.stdout}` : `${where}\nCommand: ${command} ${parts[3]}\n\n${result.stdout}`;
        }
        return uri.toString();
    }
}

export async function activate(context: vscode.ExtensionContext) {
    const explorer = await k8s.extension.clusterExplorer.v1;
    if (!explorer.available) {
        vscode.window.showErrorMessage(`ClusterExplorer not available.`);
        return;
    }

    const kubectl = await k8s.extension.kubectl.v1;
    if (!kubectl.available) {
        vscode.window.showErrorMessage(`kubectl not available.`);
        return;
    }

    explorer.api.registerNodeContributor(new FileSystemNodeContributor(kubectl.api));
    let disposable = vscode.commands.registerCommand('k8s.node.terminal', nodeTerminal);
    context.subscriptions.push(disposable);
    disposable = vscode.commands.registerCommand('k8s.pod.container.terminal', terminal);
    context.subscriptions.push(disposable);
    disposable = vscode.commands.registerCommand('k8s.pod.container.folder.find', find);
    context.subscriptions.push(disposable);
    disposable = vscode.commands.registerCommand('k8s.pod.container.folder.ls-al', lsDashAl);
    context.subscriptions.push(disposable);
    disposable = vscode.commands.registerCommand('k8s.pod.container.folder.cp-from', folderCpFrom);
    context.subscriptions.push(disposable);
    disposable = vscode.commands.registerCommand('k8s.pod.container.folder.cp-to-from-folder', folderCpToFromFolder);
    context.subscriptions.push(disposable);
    disposable = vscode.commands.registerCommand('k8s.pod.container.folder.cp-to-from-file', folderCpToFromFile);
    context.subscriptions.push(disposable);
    disposable = vscode.commands.registerCommand('k8s.pod.container.file.view', viewFile);
    context.subscriptions.push(disposable);
    disposable = vscode.commands.registerCommand('k8s.pod.container.file.tail-f', tailDashFFile);
    context.subscriptions.push(disposable);
    disposable = vscode.commands.registerCommand('k8s.pod.container.file.cp-from', fileCpFrom);
    context.subscriptions.push(disposable);

    const kubernetesContainerFileDocumentProvider = new KubernetesContainerFileDocumentProvider(kubectl.api);
    disposable = vscode.workspace.registerTextDocumentContentProvider(KUBERNETES_FILE_VIEW, kubernetesContainerFileDocumentProvider);
    context.subscriptions.push(disposable);
    disposable = vscode.workspace.registerTextDocumentContentProvider(KUBERNETES_FOLDER_FIND, kubernetesContainerFileDocumentProvider);
    context.subscriptions.push(disposable);
    disposable = vscode.workspace.registerTextDocumentContentProvider(KUBERNETES_FOLDER_LS_AL, kubernetesContainerFileDocumentProvider);
    context.subscriptions.push(disposable);
}

function nodeTerminalImpl(terminal: vscode.Terminal, nodeName: string, hostName: string, nsenterImage: string) {
    let imagePullPolicy = '';
    if (nsenterImage && nsenterImage.includes('@sha256:')) {
        // If using @sha256:... for image tag try to use cached image for offline use
        imagePullPolicy = '--image-pull-policy=IfNotPresent';
    }

    terminal.sendText(`cls`);
    if (process.platform === 'win32') {
        const defaultProfileWindows = vscode.workspace.getConfiguration().get<string>('terminal.integrated.defaultProfile.windows');
        if ('Command Prompt' === defaultProfileWindows) {
            terminal.sendText(`kubectl run nsenter-${nodeName} -q ${imagePullPolicy} --restart=Never -it --rm --image=overriden --overrides={"""spec""":{"""hostPID""":true,"""hostNetwork""":true,"""nodeSelector""":{"""kubernetes.io/hostname""":"""${hostName}"""},"""tolerations""":[{"""operator""":"""Exists"""}],"""containers""":[{"""name""":"""nsenter""","""image""":"""${nsenterImage}""","""command""":["""/nsenter""","""--all""","""--target=1""","""--""","""su""","""-"""],"""stdin""":true,"""tty""":true,"""securityContext""":{"""privileged""":true}}]}} --attach ${nodeName}`);
        } else if ('PowerShell' === defaultProfileWindows) {
            terminal.sendText(`kubectl run nsenter-${nodeName} -q ${imagePullPolicy} --restart=Never -it --rm --image=overriden --overrides='{\\"spec\\":{\\"hostPID\\":true,\\"hostNetwork\\":true,\\"nodeSelector\\":{\\"kubernetes.io/hostname\\":\\"${hostName}\\"},\\"tolerations\\":[{\\"operator\\":\\"Exists\\"}],\\"containers\\":[{\\"name\\":\\"nsenter\\",\\"image\\":\\"${nsenterImage}\\",\\"command\\":[\\"/nsenter\\",\\"--all\\",\\"--target=1\\",\\"--\\",\\"su\\",\\"-\\"],\\"stdin\\":true,\\"tty\\":true,\\"securityContext\\":{\\"privileged\\":true}}]}}' --attach ${nodeName}`);
        }
    } else {
        terminal.sendText(`kubectl run nsenter-${nodeName} -q ${imagePullPolicy} --restart=Never -it --rm --image=overriden --overrides='{"spec":{"hostPID":true,"hostNetwork":true,"nodeSelector":{"kubernetes.io/hostname":"${hostName}"},"tolerations":[{"operator":"Exists"}],"containers":[{"name":"nsenter","image":"${nsenterImage}","command":["/nsenter","--all","--target=1","--","su","-"],"stdin":true,"tty":true,"securityContext":{"privileged":true}}]}}' --attach ${nodeName}`);
    }
    terminal.show();
    setTimeout(() => {
        vscode.commands.executeCommand('extension.vsKubernetesRefreshExplorer');
        terminal.sendText(`\n`);
        setTimeout(() => {
            vscode.commands.executeCommand('extension.vsKubernetesRefreshExplorer');
        }, 5000);
    }, 5000);
}

async function nodeTerminal(target?: any) {
    const explorer = await k8s.extension.clusterExplorer.v1;
    if (!explorer.available) {
        return;
    }
    const commandTarget = explorer.api.resolveCommandTarget(target);
    if (commandTarget) {
        if (commandTarget.nodeType === 'resource') {
            if (commandTarget.resourceKind.manifestKind === 'Node') {
                let nsenterImage = vscode.workspace.getConfiguration().get<string>('kubernetes-file-system-explorer.nsenter-image');
                if (!nsenterImage || nsenterImage.trim() === '') {
                    vscode.window.showErrorMessage(`Must set nsenter image in config: 'kubernetes-file-system-explorer.nsenter-image'`);
                    vscode.commands.executeCommand( 'workbench.action.openSettings', '@ext:sandipchitale.kubernetes-file-system-explorer')
                    return;
                } else if (nsenterImage.endsWith("jpetazzo/nsenter:latest")) {
                    const answer = await vscode.window.showInformationMessage(
                        `Use image tag:\n\njpetazzo/nsenter@sha256:9a5758441e7929abcff9f13a69b4ca962063ec89b818395f02b7b7e8150ca088\n\ninstead of\n\njpetazzo/nsenter:latest\n\nto enable cached (offline) image.?`,
                        {
                            modal: true
                        },
                        'Yes',
                        'No');
                    if (answer === 'Yes') {
                        // Switch to the sha256 to use of cached image
                        nsenterImage = nsenterImage.replace('jpetazzo/nsenter:latest', 'jpetazzo/nsenter@sha256:9a5758441e7929abcff9f13a69b4ca962063ec89b818395f02b7b7e8150ca088');
                        vscode.workspace.getConfiguration().update('kubernetes-file-system-explorer.nsenter-image', nsenterImage, true);
                    } else if (answer === 'No') {
                        // continue with jpetazzo/nsenter:latest
                    } else {
                        return;
                    }
                }
                const nodeName = commandTarget.name;
                const kubectl = await k8s.extension.kubectl.v1;
                if (!kubectl.available) {
                    return;
                }
                const podDetails = await kubectl.api.invokeCommand(`get nodes ${nodeName} -o json`);
                if (podDetails && podDetails.stdout) {
                    const nodeDetailsAsJson = JSON.parse(podDetails.stdout);
                    if (nodeDetailsAsJson.metadata.labels['kubernetes.io/hostname']) {
                        const terminalName = `nsenter-${nodeName}`;
                        // Try to reuse terminal
                        let terminal = vscode.window.terminals.find(terminal => terminal.name === terminalName);
                        if (!terminal) {
                            terminal = vscode.window.createTerminal({ name: terminalName });
                        }
                        nodeTerminalImpl(terminal,
                            nodeName,
                            nodeDetailsAsJson.metadata.labels['kubernetes.io/hostname'],
                            nsenterImage);
                    }
                }
                return;
            }
        }
    }
}

async function terminal(target?: any) {
    if (target && target.nodeType === 'extension') {
        if (target.impl instanceof ContainerNode) {
            if (vscode.window.activeTerminal) {
                const container = target.impl as ContainerNode;
                vscode.window.activeTerminal.sendText(`kubectl exec -it ${container.podName} -c ${container.name} --namespace ${container.namespace} -- sh`);
            }
        }
    }
}

async function find(target?: any) {
    if (target && target.nodeType === 'extension') {
        if (target.impl instanceof FolderNode) {
            (target.impl as FolderNode).find();
            return;
        }
    }
}

async function lsDashAl(target?: any) {
    if (target && target.nodeType === 'extension') {
        if (target.impl instanceof FolderNode) {
            (target.impl as FolderNode).lsDashAl();
            return;
        }
    }
}

function folderCpFrom(target?: any) {
    if (target && target.nodeType === 'extension') {
        if (target.impl instanceof FolderNode) {
            const folderNode = target.impl as FolderNode;
            const openDialogOptions: vscode.OpenDialogOptions = {
                openLabel: 'Select the folder to cp to',
                canSelectFiles: false,
                canSelectFolders: true
            };
            vscode.window.showOpenDialog(openDialogOptions).then((selected) => {
                if (selected) {
                    const terminal = vscode.window.activeTerminal || vscode.window.createTerminal();
                    terminal.show();
                    const fsPath = selected[0].fsPath;
                    if (terminal.creationOptions.shellPath?.toLowerCase()?.includes('cmd.exe')) {
                        terminal.sendText(`cd /D ${fsPath}`);
                    } else {
                        terminal.sendText(`cd ${fsPath}`);
                    }
                    terminal.sendText(`kubectl cp ${folderNode.namespace}/${folderNode.podName}:${folderNode.path}${folderNode.name} ${folderNode.name} -c ${folderNode.containerName}`);
                }
            });
            return;
        }
    }
}

function folderCpToFromFolder(target?: any) {
    if (target && target.nodeType === 'extension') {
        if (target.impl instanceof FolderNode) {
            const folderNode = target.impl as FolderNode;
            const openDialogOptions: vscode.OpenDialogOptions = {
                openLabel: 'Select the folder to cp',
                canSelectFiles: false,
                canSelectFolders: true
            };
            vscode.window.showOpenDialog(openDialogOptions).then((selected) => {
                if (selected) {
                    const terminal = vscode.window.activeTerminal || vscode.window.createTerminal();
                    terminal.show();
                    const fsPath = selected[0].fsPath;
                    const dirname = path.dirname(fsPath);
                    const basename = path.basename(fsPath);
                    if (process.platform === 'win32') {
                        terminal.sendText(`cd /D ${dirname}`);
                    } else {
                        terminal.sendText(`cd ${dirname}`);
                    }
                    terminal.sendText(`kubectl cp ${basename} ${folderNode.namespace}/${folderNode.podName}:${folderNode.path}${folderNode.name}${basename} -c ${folderNode.containerName}`);                }
            });
            return;
        }
    }
}

function folderCpToFromFile(target?: any) {
    if (target && target.nodeType === 'extension') {
        if (target.impl instanceof FolderNode) {
            const folderNode = target.impl as FolderNode;
            const openDialogOptions: vscode.OpenDialogOptions = {
                openLabel: 'Select the file to cp',
                canSelectFiles: true,
                canSelectFolders: false
            };
            vscode.window.showOpenDialog(openDialogOptions).then((selected) => {
                if (selected) {
                    const terminal = vscode.window.activeTerminal || vscode.window.createTerminal();
                    terminal.show();
                    const fsPath = selected[0].fsPath;
                    const dirname = path.dirname(fsPath);
                    const basename = path.basename(fsPath);
                    if (process.platform === 'win32') {
                        terminal.sendText(`cd /D ${dirname}`);
                    } else {
                        terminal.sendText(`cd ${dirname}`);
                    }
                    terminal.sendText(`kubectl cp ${basename} ${folderNode.namespace}/${folderNode.podName}:${folderNode.path}${folderNode.name}${basename} -c ${folderNode.containerName}`);
                }
            });
            return;
        }
    }
}

async function viewFile(target?: any) {
    if (target && target.nodeType === 'extension') {
        if (target.impl instanceof FileNode) {
            if ((target.impl as FileNode).isFile()) {
                (target.impl as FileNode).viewFile();
                return;
            }
        }
    }
}

async function tailDashFFile(target?: any) {
    if (target && target.nodeType === 'extension') {
        if (target.impl instanceof FileNode) {
            if ((target.impl as FileNode).isFile()) {
                (target.impl as FileNode).tailDashFFile();
                return;
            }
        }
    }
}

function fileCpFrom(target?: any) {
    if (target && target.nodeType === 'extension') {
        if (target.impl instanceof FileNode) {
            const fileNode = target.impl as FileNode;
            const openDialogOptions: vscode.OpenDialogOptions = {
                openLabel: 'Select the folder to cp to',
                canSelectFiles: false,
                canSelectFolders: true
            };
            vscode.window.showOpenDialog(openDialogOptions).then((selected) => {
                if (selected) {
                    const terminal = vscode.window.activeTerminal || vscode.window.createTerminal();
                    terminal.show();
                    const fsPath = selected[0].fsPath;
                    if (process.platform === 'win32') {
                        terminal.sendText(`cd /D ${fsPath}`);
                    } else {
                        terminal.sendText(`cd ${fsPath}`);
                    }
                    terminal.sendText(`kubectl cp ${fileNode.namespace}/${fileNode.podName}:${fileNode.path}${fileNode.name} ${fileNode.name} -c ${fileNode.containerName}`);
                }
            });
            return;
        }
    }
}

export function deactivate() {
}
