---
sidebar_position: 7
sidebar_label: 'Metrics'
---

# Metrics & troubleshooting

All is good as long as we are hitting the happy path, but what to do when things don't (immediately) work out? Have a packet that got lost? A contract that won't deploy?

## Logging with the `logs` command

A first good step when troubleshooting is to inspect the logs. If you're familiar with Docker logs, this will feel very similar.

Let's consult the help command and look at the options:

```bash
> ibctl logs -h

# terminal output
Usage: ibctl logs [options] <name>

Fetches the logs from any component of the stack. It mimics the `docker logs` functionality with similar options.

Options:
  --since <since>    Show logs since timestamp (e.g. "2013-01-02T13:23:37Z") or relative (e.g. "42m" for 42 minutes)
  -n, --tail <tail>  Number of lines to show from the end of the logs (default "all")
  -f, --follow       Follow log output
  -t, --timestamps   Show timestamps
  --until <until>    Show logs before a timestamp (e.g. "2013-01-02T13:23:37Z") or relative (e.g. "42m" for 42 minutes)
  -h, --help         Display help command
```

You'll be passing on the name of either the chain or relayer container along with some options indicating how far back you want the logs to be exposed.

## Events and packet tracing

When developing contracts that send or receive IBC packets, it's important to be able to quickly query the relevant information with respect to the packet lifecycle to check whether or not you get the expected results or if you need to troubleshoot.

- The `ibctl events` command will give an overall view of IBC related events for one particular chain.
- The `trace-packets` command will give an aggregate overview of all packet related (so excluding handshake events) event data for a specific pair of endpoints (chain:channel:port).

```bash
> ibctl events -h

# terminal output
Usage: ibctl events [options] <chain-name>

Queries events from a chain, given the provided height ranges and prints them out in a readable way

Options:
  -m, --min-height <min-height>  Get events starting from this height (default: 1)
  -M, --max-height <max-height>  Get events until this height
  -H, --height <height>          Get events from this height
  -x, --extended                 Show the full content of the events instead of their type (default: false)
  -j, --json                     Output in json format (default: false)
  -F, --all-events               Get all events, including "message" event in cosmos chains (default: false)
  -h, --help                     Display help command
```

```bash
> ibctl trace-packets -h

# terminal output
Usage: ibctl trace-packets [options] <endpoint-a> <endpoint-b>

Trace packet execution over the specified endpoints. The endpoint format must be `chain_id:channel_id:port_id`
```

:::tip

A workflow combining all of of these troubleshooting options should lead to insights around your IBC packet status quickly in most cases. Learn how to read the event data (and conversely make sure you emit events in your own contracts) to streamline development!

:::
