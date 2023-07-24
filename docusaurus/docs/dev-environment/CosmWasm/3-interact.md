---
sidebar_position: 3
sidebar_label: 'Interact with CosmWasm contracts'
---

# Interact with CosmWasm contracts

In the previous sections, a brief introduction into CosmWasm development was provided. Single or multichain with IBC.

However, it's possible that you don't actually want to develop smart contracts in CosmWasm but instead interact with them, making cross-chain contract calls or building a Typescript client for a UI for your application.

To do this, you'll have to get access to the JSON schema.

## JSON schema for the contract messages

While the Wasm calls (instantiate, execute, query) accept JSON, this is not enough information to use it. You need to expose the schema for the expected messages to the clients. You can generate this schema by calling `cargo schema` from your application's root directory, which will output 4 files in `./schema`, corresponding to the 3 message types the contract accepts, as well as the internal State.

These files are in standard json-schema format, which should be usable by various client side tools, either to auto-generate codecs, or just to validate incoming json to the defined schema.

## Using the schema for front-end clients

Because all of the information to interact with the contract is included in the JSON schema, it is possible to onvert your CosmWasm smart contracts into dev-friendly TypeScript classes.

This is achieved through the [ts-codegen](https://github.com/CosmWasm/ts-codegen) library.

Follow a quickstart guide on the Cosmology Youtube [here](https://www.youtube.com/playlist?list=PL-lMkVv7GZwz1KO3jANwr5W4MoziruXwK).

## CW20-ICS20 Example

Let's take a look at a real-life example, the [CW20-ICS20](https://github.com/CosmWasm/cw-plus/tree/main/contracts/cw20-ics20) contract.

This is an IBC Enabled contract that allows us to send CW20 tokens from one chain over the standard ICS20 protocol to the bank module of another chain. In short, it lets us send our custom CW20 tokens with IBC and use them just like native tokens on other chains.

:::caution

It is only designed to send tokens and redeem previously sent tokens. It will not mint tokens belonging to assets originating on the foreign chain. This is different than the Golang ibctransfer module, but we properly implement ICS20 and respond with an error message...

:::

Only the parts of the schema corresponding to instantiate, execute and query messages have been included for brevity.

````json
{
  "contract_name": "cw20-ics20",
  "contract_version": "1.0.1",
  "idl_version": "1.0.0",
  "instantiate": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "InstantiateMsg",
    "type": "object",
    "required": ["allowlist", "default_timeout", "gov_contract"],
    "properties": {
      "allowlist": {
        "description": "initial allowlist - all cw20 tokens we will send must be previously allowed by governance",
        "type": "array",
        "items": {
          "$ref": "#/definitions/AllowMsg"
        }
      },
      "default_gas_limit": {
        "description": "If set, contracts off the allowlist will run with this gas limit. If unset, will refuse to accept any contract off the allow list.",
        "type": ["integer", "null"],
        "format": "uint64",
        "minimum": 0.0
      },
      "default_timeout": {
        "description": "Default timeout for ics20 packets, specified in seconds",
        "type": "integer",
        "format": "uint64",
        "minimum": 0.0
      },
      "gov_contract": {
        "description": "who can allow more contracts",
        "type": "string"
      }
    },
    "additionalProperties": false,
    "definitions": {
      "AllowMsg": {
        "type": "object",
        "required": ["contract"],
        "properties": {
          "contract": {
            "type": "string"
          },
          "gas_limit": {
            "type": ["integer", "null"],
            "format": "uint64",
            "minimum": 0.0
          }
        },
        "additionalProperties": false
      }
    }
  },
  "execute": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "ExecuteMsg",
    "oneOf": [
      {
        "description": "This accepts a properly-encoded ReceiveMsg from a cw20 contract",
        "type": "object",
        "required": ["receive"],
        "properties": {
          "receive": {
            "$ref": "#/definitions/Cw20ReceiveMsg"
          }
        },
        "additionalProperties": false
      },
      {
        "description": "This allows us to transfer *exactly one* native token",
        "type": "object",
        "required": ["transfer"],
        "properties": {
          "transfer": {
            "$ref": "#/definitions/TransferMsg"
          }
        },
        "additionalProperties": false
      },
      {
        "description": "This must be called by gov_contract, will allow a new cw20 token to be sent",
        "type": "object",
        "required": ["allow"],
        "properties": {
          "allow": {
            "$ref": "#/definitions/AllowMsg"
          }
        },
        "additionalProperties": false
      },
      {
        "description": "Change the admin (must be called by current admin)",
        "type": "object",
        "required": ["update_admin"],
        "properties": {
          "update_admin": {
            "type": "object",
            "required": ["admin"],
            "properties": {
              "admin": {
                "type": "string"
              }
            },
            "additionalProperties": false
          }
        },
        "additionalProperties": false
      }
    ],
    "definitions": {
      "AllowMsg": {
        "type": "object",
        "required": ["contract"],
        "properties": {
          "contract": {
            "type": "string"
          },
          "gas_limit": {
            "type": ["integer", "null"],
            "format": "uint64",
            "minimum": 0.0
          }
        },
        "additionalProperties": false
      },
      "Binary": {
        "description": "Binary is a wrapper around Vec<u8> to add base64 de/serialization with serde. It also adds some helper methods to help encode inline.\n\nThis is only needed as serde-json-{core,wasm} has a horrible encoding for Vec<u8>. See also <https://github.com/CosmWasm/cosmwasm/blob/main/docs/MESSAGE_TYPES.md>.",
        "type": "string"
      },
      "Cw20ReceiveMsg": {
        "description": "Cw20ReceiveMsg should be de/serialized under `Receive()` variant in a ExecuteMsg",
        "type": "object",
        "required": ["amount", "msg", "sender"],
        "properties": {
          "amount": {
            "$ref": "#/definitions/Uint128"
          },
          "msg": {
            "$ref": "#/definitions/Binary"
          },
          "sender": {
            "type": "string"
          }
        },
        "additionalProperties": false
      },
      "TransferMsg": {
        "description": "This is the message we accept via Receive",
        "type": "object",
        "required": ["channel", "remote_address"],
        "properties": {
          "channel": {
            "description": "The local channel to send the packets on",
            "type": "string"
          },
          "memo": {
            "description": "An optional memo to add to the IBC transfer",
            "type": ["string", "null"]
          },
          "remote_address": {
            "description": "The remote address to send to. Don't use HumanAddress as this will likely have a different Bech32 prefix than we use and cannot be validated locally",
            "type": "string"
          },
          "timeout": {
            "description": "How long the packet lives in seconds. If not specified, use default_timeout",
            "type": ["integer", "null"],
            "format": "uint64",
            "minimum": 0.0
          }
        },
        "additionalProperties": false
      },
      "Uint128": {
        "description": "A thin wrapper around u128 that is using strings for JSON encoding/decoding, such that the full u128 range can be used for clients that convert JSON numbers to floats, like JavaScript and jq.\n\n# Examples\n\nUse `from` to create instances of this and `u128` to get the value out:\n\n``` # use cosmwasm_std::Uint128; let a = Uint128::from(123u128); assert_eq!(a.u128(), 123);\n\nlet b = Uint128::from(42u64); assert_eq!(b.u128(), 42);\n\nlet c = Uint128::from(70u32); assert_eq!(c.u128(), 70); ```",
        "type": "string"
      }
    }
  },
  "query": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "QueryMsg",
    "oneOf": [
      {
        "description": "Return the port ID bound by this contract.",
        "type": "object",
        "required": ["port"],
        "properties": {
          "port": {
            "type": "object",
            "additionalProperties": false
          }
        },
        "additionalProperties": false
      },
      {
        "description": "Show all channels we have connected to.",
        "type": "object",
        "required": ["list_channels"],
        "properties": {
          "list_channels": {
            "type": "object",
            "additionalProperties": false
          }
        },
        "additionalProperties": false
      },
      {
        "description": "Returns the details of the name channel, error if not created.",
        "type": "object",
        "required": ["channel"],
        "properties": {
          "channel": {
            "type": "object",
            "required": ["id"],
            "properties": {
              "id": {
                "type": "string"
              }
            },
            "additionalProperties": false
          }
        },
        "additionalProperties": false
      },
      {
        "description": "Show the Config.",
        "type": "object",
        "required": ["config"],
        "properties": {
          "config": {
            "type": "object",
            "additionalProperties": false
          }
        },
        "additionalProperties": false
      },
      {
        "type": "object",
        "required": ["admin"],
        "properties": {
          "admin": {
            "type": "object",
            "additionalProperties": false
          }
        },
        "additionalProperties": false
      },
      {
        "description": "Query if a given cw20 contract is allowed.",
        "type": "object",
        "required": ["allowed"],
        "properties": {
          "allowed": {
            "type": "object",
            "required": ["contract"],
            "properties": {
              "contract": {
                "type": "string"
              }
            },
            "additionalProperties": false
          }
        },
        "additionalProperties": false
      },
      {
        "description": "List all allowed cw20 contracts.",
        "type": "object",
        "required": ["list_allowed"],
        "properties": {
          "list_allowed": {
            "type": "object",
            "properties": {
              "limit": {
                "type": ["integer", "null"],
                "format": "uint32",
                "minimum": 0.0
              },
              "start_after": {
                "type": ["string", "null"]
              }
            },
            "additionalProperties": false
          }
        },
        "additionalProperties": false
      }
    ]
  },
  ...
}
````
