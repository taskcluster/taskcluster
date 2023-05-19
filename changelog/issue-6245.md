audience: users
level: minor
reference: issue 6245
---
Generic Worker payload now supports declaratively mounting indexed artifacts into the task directory. For example:

```yml
payload:
  mounts:
    content:
      namespace: my.index.namespace
      artifact: public/image.jpg
    file: pics/image.jpg
```
