# bedrock-ledger-core
Bedrock Leger Core

## Install

```
npm i --save bedrock-ledger-core
# install the peerDependencies
# the list below is merely a few peerDependencies
npm i --save bedrock-ledger-context bedrock-ledger-node bedrock-ledger-storage-mongodb
npm i --save bedrock-ledger-consensus-continuity bedrock-ledger-consensus-continuity-storage
```

## Usage

You will need to install and require a consensus algorithm for the ledger.
The most current algorithm is `bedrock-ledger-consensus-continuity-es-elector-pool`.

```
npm i --save bedrock-ledger-consensus-continuity-es-elector-pool
```

Configurations for consensus methods vary.

Inside of your application require this file to load the common settings.

```js
require('bedrock-ledger-core');
require('bedrock-ledger-consensus-continuity-es-elector-pool');
```
