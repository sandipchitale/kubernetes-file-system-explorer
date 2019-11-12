'use strict';

import * as vscode from 'vscode';
import * as k8s from 'vscode-kubernetes-tools-api';
import { platform } from 'os';

const KUBERNETES_FILE_VIEW = 'kubernetes-file-view';
const KUBERNETES_FOLDER_FIND = 'kubernetes-folder-find';
const KUBERNETES_FOLDER_LS_AL = 'kubernetes-folder-ls-al';


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
        return treeItem;
    }
}

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
        const treeItem = new vscode.TreeItem('Volume: ' + this.volume.name, vscode.TreeItemCollapsibleState.None);
        treeItem.tooltip = JSON.stringify(this.volume, null, '  ');
        treeItem.contextValue = 'volumenode';
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

    constructor(kubectl:  k8s.KubectlV1, podName: string, namespace: string, name: string, image: string, initContainer: boolean, volumeMounts: any) {
        this.kubectl = kubectl;
        this.podName = podName;
        this.namespace = namespace;
        this.name = name;
        this.image = image;
        this.initContainer = initContainer;
        this.volumeMounts = volumeMounts;
    }

    async getChildren(): Promise<k8s.ClusterExplorerV1.Node[]> {
        const volumeMountNodes = [];
        if (this.volumeMounts && this.volumeMounts.length > 0) {
            this.volumeMounts.forEach((volumeMount) => {
                volumeMountNodes.push(new VolumeMountNode(this.name, this.namespace, volumeMount));
            })
        }
        return volumeMountNodes;
    }

    getTreeItem(): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(`${this.initContainer ? 'Init Container:' : 'Container: ' } ${this.name} ( ${this.image } )`,
            (this.volumeMounts && this.volumeMounts.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None));
        treeItem.tooltip = `${this.initContainer ? 'Init Container:' : 'Container: ' } ${this.name} ( ${this.image } )`;
        treeItem.contextValue = 'containernode';
        return treeItem;
    }
}

class FolderNode implements k8s.ClusterExplorerV1.Node {
    private kubectl: k8s.KubectlV1;
    private podName: string;
    private namespace: string;
    private containerName: string;
    private path: string;
    private name: string;
    private volumeMounts: Array<any>;

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
        if (this.volumeMounts.includes(`${this.path}${this.name.substring(0, this.name.length - 1)}`)) {
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
    private podName: string;
    private namespace: string;
    private containerName: string;
    private path: string;
    private name: string;
    private volumeMounts: Array<any>;

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
        if (this.volumeMounts.includes(`${this.path}${this.name}`)) {
            label += ` [Mounted]`
        }
        const treeItem = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        treeItem.tooltip = this.path + label;
        treeItem.contextValue = 'containerfilenode';
        return treeItem;
    }

    isFile() {
        return true;
    }

    async viewFile() {
        let doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(`kubernetes-file-view:${this.podName}:${this.namespace}:${this.containerName}:${this.path}/${this.name}`));
        await vscode.window.showTextDocument(doc, { preview: false });
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
                    const podDetails = await kubectl.api.invokeCommand(`get pods ${parent.name} -o json`);
                    if (podDetails && podDetails.stdout) {
                        const podDetailsAsJson = JSON.parse(podDetails.stdout);
                        const volumes = [];
                        podDetailsAsJson.spec.volumes.forEach((volume) => {
                            volumes.push(new VolumeNode(parent.name, parent.namespace, volume));
                        });
                        const containers = [];
                        if (podDetailsAsJson.spec.initContainers) {
                            podDetailsAsJson.spec.initContainers.forEach((container) => {
                                containers.push(new ContainerNode(this.kubectl, parent.name, parent.namespace, container.name, container.image, true, container.volumeMounts));
                            });
                        }
                        podDetailsAsJson.spec.containers.forEach((container) => {
                            containers.push(new ContainerNode(this.kubectl, parent.name, parent.namespace, container.name, container.image, false, container.volumeMounts));
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
            let output = (uri.scheme === KUBERNETES_FILE_VIEW) ?  '' : `${command} ${parts[3]}\n\n`;
            output += result.stdout;
            if (output) {
                return output;
            }
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
    disposable = vscode.commands.registerCommand('k8s.pod.container.file.view', viewFile);
    context.subscriptions.push(disposable);
    disposable = vscode.commands.registerCommand('k8s.pod.container.folder.find', find);
    context.subscriptions.push(disposable);
    disposable = vscode.commands.registerCommand('k8s.pod.container.folder.ls-al', lsDashAl);
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
    terminal.sendText(`cls`);
    if (process.platform === 'win32') {
        terminal.sendText(`function prompt {"> "}`);
        terminal.sendText(`$hostName = '${hostName}'`);
        terminal.sendText(`$nodeName = '${nodeName}'`);
        terminal.sendText(`$overrides = '{"spec":{"hostPID":true,"hostNetwork":true,"nodeSelector":{"kubernetes.io/hostname":"' + $hostName + '"},"tolerations":[{"operator":"Exists"}],"containers":[{"name":"nsenter","image":"${nsenterImage}","command":["/nsenter","--all","--target=1","--","su","-"],"stdin":true,"tty":true,"securityContext":{"privileged":true}}]}}' | ConvertTo-Json`);
        terminal.sendText(`cls`);
        terminal.sendText(`kubectl.exe run ncenter-${nodeName} --restart=Never -it --rm --image=overriden --overrides=$overrides --attach $nodeName`);
    } else {
        terminal.sendText(`kubectl.exe run ncenter-${nodeName} --restart=Never -it --rm --image=overriden --overrides='{"spec":{"hostPID":true,"hostNetwork":true,"nodeSelector":{"kubernetes.io/hostname":"${hostName}"},"tolerations":[{"operator":"Exists"}],"containers":[{"name":"nsenter","image":"${nsenterImage}","command":["/nsenter","--all","--target=1","--","su","-"],"stdin":true,"tty":true,"securityContext":{"privileged":true}}]}}' --attach ${nodeName}`);
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
                const nsenterImage = vscode.workspace.getConfiguration().get<string>('kubernetes-file-system-explorer.nsenter-image');
                if (!nsenterImage) {
                    vscode.window.showErrorMessage(`Must set nsenter image in config: 'kubernetes-file-system-explorer.nsenter-image'`);
                    return;
                }
                const shell = vscode.workspace.getConfiguration().get<string>('terminal.integrated.shell.windows');
                if (shell.indexOf('powershell') === -1) {
                    vscode.window.showErrorMessage(`Only works when 'terminal.integrated.shell.windows' is set to Powershell.`);
                } else {
                    const nodeName = commandTarget.name;
                    const kubectl = await k8s.extension.kubectl.v1;
                    if (!kubectl.available) {
                        return;
                    }
                    const podDetails = await kubectl.api.invokeCommand(`get nodes ${nodeName} -o json`);
                    if (podDetails && podDetails.stdout) {
                        const nodeDetailsAsJson = JSON.parse(podDetails.stdout);
                        if (nodeDetailsAsJson.metadata.labels['kubernetes.io/hostname']) {
                            nodeTerminalImpl(vscode.window.createTerminal({name: `ncenter-${nodeName}`}),
                                nodeName,
                                nodeDetailsAsJson.metadata.labels['kubernetes.io/hostname'],
                                nsenterImage);
                        }
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

export function deactivate() {
}
