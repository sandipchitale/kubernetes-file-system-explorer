'use strict';

import * as vscode from 'vscode';
import * as k8s from 'vscode-kubernetes-tools-api';


class FileNode implements k8s.ClusterExplorerV1.Node {
    private path: string;
    private name: string;

    constructor(path: string, name: string) {
        this.path = path;
        this.name = name;
    }

    async getChildren(): Promise<k8s.ClusterExplorerV1.Node[]> {
        return [];
    }

    getTreeItem(): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(this.name, vscode.TreeItemCollapsibleState.None);
        treeItem.tooltip = this.path + this.name;
        treeItem.iconPath = vscode.ThemeIcon.File;
        return treeItem;
    }
}

class FolderNode implements k8s.ClusterExplorerV1.Node {
    private kubectl: k8s.KubectlV1;
    private podName: string;
    private path: string;
    private name: string;

    constructor(kubectl:  k8s.KubectlV1, podName: string, path: string, name: string) {
        this.kubectl = kubectl;
        this.podName = podName;
        this.path = path;
        this.name = name;
    }

    async getChildren(): Promise<k8s.ClusterExplorerV1.Node[]> {
        const lsResult = await this.kubectl.invokeCommand(`exec -it ${this.podName} -- ls -F ${this.path}${this.name}`);

        if (!lsResult || lsResult.code !== 0) {
            vscode.window.showErrorMessage(`Can't get resource usage: ${lsResult ? lsResult.stderr : 'unable to run kubectl'}`);
            return;
        }
        const lsCommandOutput = lsResult.stdout;
        if (lsCommandOutput.trim().length > 0) {
            const fileNames = lsCommandOutput.split('\n').filter((fileName) => fileName && fileName.trim().length > 0);
            return fileNames.map((fileName) => {
                if (fileName.endsWith('/')) {
                    return new FolderNode(this.kubectl, this.podName, this.path + this.name, fileName)
                } else {
                    return new FileNode(this.path+this.name, fileName)
                }
            });
        }
        return [];
    }

    getTreeItem(): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(this.name.trim().length > 0 ? this.name : this.path, vscode.TreeItemCollapsibleState.Collapsed);
        treeItem.tooltip = this.path + this.name;
        treeItem.iconPath = vscode.ThemeIcon.Folder;
        return treeItem;
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
            return [ new FolderNode(this.kubectl, parent.name, '/', '') ];

            // // Example of using the kubectl API to invoke a command
            // const lsResult = await this.kubectl.invokeCommand(`exec -it ${parent.name} -- ls -F /`);

            // if (!lsResult || lsResult.code !== 0) {
            //     vscode.window.showErrorMessage(`Can't get resource usage: ${lsResult ? lsResult.stderr : 'unable to run kubectl'}`);
            //     return;
            // }
            // const lsCommandOutput = lsResult.stdout;
            // const fileNames = lsCommandOutput.split('\n');
            // return fileNames.map((fileName) => {
            //     if (fileName.endsWith('/')) {
            //         return new FolderNode(this.kubectl, parent.name, '/', fileName)
            //     } else {
            //         return new FileNode(fileName)
            //     }
            // });
        }
        return [];
    }
}

export async function activate(context: vscode.ExtensionContext) {
    const explorer = await k8s.extension.clusterExplorer.v1;
    if (!explorer.available) {
        vscode.window.showErrorMessage(`Command not available.`);
        return;
    }

    const kubectl = await k8s.extension.kubectl.v1;
    if (!kubectl.available) {
        vscode.window.showErrorMessage(`kubectl not available.`);
        return;
    }

    explorer.api.registerNodeContributor(new FileSystemNodeContributor(kubectl.api));
}

export function deactivate() {
}
