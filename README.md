# Google Drive Actor

The Google Drive actor can be used to manage files and folders.

## Usage

The actor is used to perform operations, he will receive them via input. 

## Input

The input of the actor is JSON with the following parameters.

| Field | Type | Description |
| ----- | ---- | ----------- |
| operations | Array | The operations to execute |
| operations[*] | Object |  Operations options, mainly it contains the **type** and other specific options (check the next section)  |


### Operations

Operations are the main parameter for the input, they passed as objects and distinguished by **type** option. Option **type** can have one the following values: **files-copy**, and **folders-delete**. For each operation type there is specific options, those options are explained bellow for each type:

#### files-copy

| Field | Type | Description |
| ----- | ---- | ----------- |
| source | Object | Represent the file(s) to copy |
| destination | String | The full path on Google drive where the file(s) will be saved |

**Example:**
```json
{
      "type": "files-copy",
      "source": {
        "type": "key-value-store",
        "id": "IdOrName",
        "forceCloud": true,
        "files": [
            {
              "key": "my_spreadsheet",
              "name": "My spreadsheet",
              "options": {
                "resource": {
                  "mimeType": "application/vnd.google-apps.spreadsheet"
                },
                "media": {
                  "mimeType": "text/csv"
                }
              }
            },
            {
              "key": "my_image",
              "name": "My Image",
              "options": {
                "media": {
                  "mimeType": "image/png"
                }
              }
            }
        ]
      },
      "destination": "My actor files"
    }
```

#### folders-delete

| Field | Type | Description |
| ----- | ---- | ----------- |
| folder | String | The full path on Google drive of folder to be deleted |

**Example:**
```json
{
      "type": "folders-delete",
      "folder": "My Folder"
}
```
