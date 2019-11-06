# kubernetes-file-system-explorer README

## Features

This extension adds tree nodes for the filesystem of a Kubernetes Pod under the Pod node in the Kubernetes Explorer View. Simply expands the treenode for a Pod to see it's filesystem. Works for Linux Pods only.

For example, the following screenshot shows the

- the `haveged-445n7` pod
- the `haveged` container
- the `haveged` container's file system
- `View file` command in the context menu of `/etc/bash.bashrc` file
- `/etc/bash.bashrc` file content loaded in a editor tab

![Pod's filesystem](images/filesystem.png)


### How it works

It basically starts at `/` by running the following Kubectl command in the Pod to get the file listing:

`kubectl exec -it pod-name -c containername -- ls -f /`

As the tree nodes for directories are expanded e.g. `/etc/`, it basically runs:

`kubectl exec -it pod-name -c containername -- ls -f /etc/`

to get listing of files and created tree nodes for them.

It also supports the following commands:

`k8s.pod.container.file.view` (View file) - Show the content of the file in editor. It basically runs:

`kubectl exec -it pod-name -c containername -- cat /path/to/file`

`k8s.pod.container.folder.find` (Find) - Show the output of `find folderpath` in editor. It basically runs:

`kubectl exec -it pod-name -c containername -- find /path/to/folder`

## Requirements

This extension works with Microsoft Kubernetes extension.

## Known Issues

- None

## Release Notes

### 1.0.0

Initial release.

### 1.0.1

Add screenshot and description.

### 1.0.2

Add command `k8s.pod.container.file.view` (View file) - Show the content of the file in editor.

### 1.0.3

Show container.

### 1.0.4

Show filesystem of all container.

### 1.0.5

Deal with links.

### 1.0.6

Updated screenshot.

### 1.0.7

Added `Find` command for folders.

### 1.0.8

Show correct commands on Container Folder and File nodes.

### 1.0.9

Terminal command on Container node.

### 1.0.10

Use TextDocumentContentProvider.
