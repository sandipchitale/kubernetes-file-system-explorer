# kubernetes-file-system-explorer README

## Features

This extension adds tree nodes for the filesystem of a Kubernetes Pod under the Pod node in the Kubernetes Explorer View. Simply expands the treenode for a Pod to see it's filesystem. Works for Linux Pods only.

For example, the following shows the file system of `haveged` pod.

![Pod's filesystem](images/filesystem.png)

### How it works

It basically starts at `/` by running the following Kubectl command in the Pod to get the file listing:

`> kubectl exec -it pod-name -- ls -f /`

As the treed nodes for directories are expanded e.g. `/etc/`, it basically runs:

`> kubectl exec -it pod-name -- ls -f /etc/`

It also supports the following command:

`k8s.pod.container.file.view` (View file) - Show the content of the file in editor. It basically run:

`> kubectl exec -it pod-name -- cat /path/to/file`


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
