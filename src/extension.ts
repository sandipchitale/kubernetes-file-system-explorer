'use strict';

import * as vscode from 'vscode';
import * as k8s from 'vscode-kubernetes-tools-api';

class FileNode implements k8s.ClusterExplorerV1.Node {
    private kubectl: k8s.KubectlV1;
    private podName: string;
    private namespace: string;
    private containerName: string;
    private path: string;
    private name: string;

    constructor(kubectl:  k8s.KubectlV1, podName: string, namespace: string, path: string, name: string, containerName: string) {
        this.kubectl = kubectl;
        this.podName = podName;
        this.namespace = namespace;
        this.containerName = containerName;
        this.path = path;
        this.name = name
            .replace(/\@$/, '')
            .replace(/\*$/, '');
    }

    async getChildren(): Promise<k8s.ClusterExplorerV1.Node[]> {
        return [];
    }

    getTreeItem(): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(this.name, vscode.TreeItemCollapsibleState.None);
        treeItem.tooltip = this.path + this.name;
        treeItem.contextValue = 'containerfilenode';
        return treeItem;
    }

    isFile() {
        return true;
    }

    async viewFile() {
        let doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(`kubernetes:${this.podName}:${this.namespace}:${this.containerName}:${this.path}/${this.name}`));
        await vscode.window.showTextDocument(doc, { preview: false });

        // const catResult = await this.kubectl.invokeCommand(`exec -it ${this.podName} ${this.containerName ? '-c ' + this.containerName : ''} --namespace ${this.namespace} -- cat ${this.path}${this.name}`);
        // if (!catResult || catResult.code !== 0) {
        //     vscode.window.showErrorMessage(`Can't get contents of file: ${catResult ? catResult.stderr : 'unable to run cat command on file ${this.path}${this.name}'}`);
        //     return;
        // }
        // const catCommandOutput = catResult.stdout;
        // if (catCommandOutput.trim().length > 0) {
        //     vscode.workspace.openTextDocument({
        //         content: catCommandOutput
        //     }).then((doc) => {
        //         vscode.window.showTextDocument(doc).then((editor) => {
        //             vscode.window.showInformationMessage(`Showing ${this.podName}:${this.path}${this.name}`);
        //         });
        //     });
        // }
    }
}

class FolderNode implements k8s.ClusterExplorerV1.Node {
    private kubectl: k8s.KubectlV1;
    private podName: string;
    private namespace: string;
    private containerName: string;
    private path: string;
    private name: string;

    constructor(kubectl:  k8s.KubectlV1, podName: string, namespace: string, path: string, name: string, containerName: string) {
        this.kubectl = kubectl;
        this.podName = podName;
        this.namespace = namespace;
        this.containerName = containerName;
        this.path = path;
        this.name = name;
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
                    return new FolderNode(this.kubectl, this.podName, this.namespace, this.path + this.name, fileName, this.containerName);
                } else {
                    return new FileNode(this.kubectl, this.podName, this.namespace, this.path+this.name, fileName, this.containerName);
                }
            });
        }
        return [];
    }

    getTreeItem(): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(this.name.trim().length > 0 ? this.name : (this.containerName ? this.containerName + ':' : '') + this.path, vscode.TreeItemCollapsibleState.Collapsed);
        treeItem.tooltip = this.path + this.name;
        treeItem.iconPath = vscode.ThemeIcon.Folder;
        treeItem.contextValue = 'containerfoldernode';
        return treeItem;
    }

    async findImpl(findArgs) {
        const findResult = await this.kubectl.invokeCommand(`exec -it ${this.podName} ${this.containerName ? '-c ' + this.containerName : ''} --namespace ${this.namespace} -- find ${this.path}${this.name} ${findArgs}`);
        if (!findResult || findResult.code !== 0) {
            vscode.window.showErrorMessage(`Can't run find: ${findResult ? findResult.stderr : 'unable to run find command on folder ${this.path}${this.name}'}`);
            return;
        }
        const findCommandOutput = findResult.stdout;
        if (findCommandOutput.trim().length > 0) {
            vscode.workspace.openTextDocument({
                content: findCommandOutput
            }).then((doc) => {
                vscode.window.showTextDocument(doc).then((editor) => {
                    vscode.window.showInformationMessage(`Showing find results ${this.podName}:${this.path}${this.name}`);
                });
            });
        }
    }

    async find() {
        let findArgs = '';
        this.findImpl(findArgs);
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
                        const containers = [];
                        podDetailsAsJson.spec.containers.forEach((container) => {
                            containers.push(new FolderNode(this.kubectl, parent.name, parent.namespace, '/', '', container.name));
                        });
                        return containers;
                    }
                }
            }
            return [ new FolderNode(this.kubectl, parent.name, parent.namespace, '/', '', undefined) ];
        }
        return [];
    }
}
class ContainerNode implements k8s.ClusterExplorerV1.Node {
    private kubectl: k8s.KubectlV1;
    podName: string;
    namespace: string;
    name: string;
    private image: string;
    private initContainer: boolean;

    constructor(kubectl:  k8s.KubectlV1, podName: string, namespace: string, name: string, image: string, initContainer: boolean) {
        this.kubectl = kubectl;
        this.podName = podName;
        this.namespace = namespace;
        this.name = name;
        this.image = image;
        this.initContainer = initContainer;
    }

    async getChildren(): Promise<k8s.ClusterExplorerV1.Node[]> {
        return [];
    }

    getTreeItem(): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(`${this.name} ( ${this.image } )`, vscode.TreeItemCollapsibleState.None);
        treeItem.tooltip = `${this.initContainer ? 'Init Container:' : 'Container: ' } ${this.name} ( ${this.image } )`;
        treeItem.contextValue = 'containernode';
        return treeItem;
    }
}

class ContainerNodeContributor {

    private kubectl: k8s.KubectlV1;

    constructor(kubectl:  k8s.KubectlV1) {
        this.kubectl = kubectl;
    }

    contributesChildren(parent: k8s.ClusterExplorerV1.ClusterExplorerNode | undefined): boolean {
        return parent && parent.nodeType === 'resource' && parent.resourceKind.manifestKind === 'Pod';
    }

    async getChildren(parent: k8s.ClusterExplorerV1.ClusterExplorerNode | undefined): Promise<k8s.ClusterExplorerV1.Node[]> {
        const containers = [];
        if (parent && parent.nodeType === 'resource' && parent.resourceKind.manifestKind === 'Pod') {
            const explorer = await k8s.extension.clusterExplorer.v1;
            if (explorer.available) {
                const kubectl = await k8s.extension.kubectl.v1;
                if (kubectl.available) {
                    const podDetails = await kubectl.api.invokeCommand(`get pods ${parent.name} -o json`);
                    if (podDetails && podDetails.stdout) {
                        const podDetailsAsJson = JSON.parse(podDetails.stdout);
                        if (podDetailsAsJson.spec.initContainers) {
                            podDetailsAsJson.spec.initContainers.forEach((container) => {
                                containers.push(new ContainerNode(this.kubectl, parent.name, parent.namespace, container.name, container.image, true));
                            });
                        }
                        podDetailsAsJson.spec.containers.forEach((container) => {
                            containers.push(new ContainerNode(this.kubectl, parent.name, parent.namespace, container.name, container.image, false));
                        });
                    }
                }
            }
        }
        return containers;
    }
}

class KubernetesContainerFileDocumentProvider implements vscode.TextDocumentContentProvider {
    private kubectl: k8s.KubectlV1;

    constructor(kubectl:  k8s.KubectlV1) {
        this.kubectl = kubectl;
    }

    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const parts = uri.path.split(':');

        const catResult = await this.kubectl.invokeCommand(`exec -it ${parts[0]}  -c ${parts[2]} --namespace ${parts[1]} -- cat ${parts[3]}`);
        if (!catResult || catResult.code !== 0) {
            vscode.window.showErrorMessage(`Can't get contents of file: ${catResult ? catResult.stderr : 'unable to run cat command on file ${this.path}${this.name}'}`);
            return uri.toString();
        }
        const catCommandOutput = catResult.stdout;
        if (catCommandOutput.trim().length > 0) {
            return catCommandOutput;
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

    explorer.api.registerNodeContributor(new ContainerNodeContributor(kubectl.api));
    explorer.api.registerNodeContributor(new FileSystemNodeContributor(kubectl.api));
    let disposable = vscode.commands.registerCommand('k8s.pod.container.terminal', terminal);
    context.subscriptions.push(disposable);
    disposable = vscode.commands.registerCommand('k8s.pod.container.file.view', viewFile);
    context.subscriptions.push(disposable);
    disposable = vscode.commands.registerCommand('k8s.pod.container.folder.find', find);
    context.subscriptions.push(disposable);

    disposable = vscode.workspace.registerTextDocumentContentProvider(
        'kubernetes', new KubernetesContainerFileDocumentProvider(kubectl.api));
    context.subscriptions.push(disposable);
}

async function terminal(target?: any) {
    if (target && target.nodeType === 'extension') {
        if (target.impl instanceof ContainerNode) {
            if (vscode.window.activeTerminal) {
                const container = target.impl as ContainerNode;
                vscode.window.activeTerminal.sendText(
`kubectl exec -it ${container.podName} -c ${container.name} --namespace ${container.namespace} -- sh`
                )
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

export function deactivate() {
}
