<!--
order: 7
 -->

### Navigate

[Previous](./6-query.md) / [Go back HOME](../index.md) / Next

# Metrics & troubleshooting

All is good as long as we are hitting the happy path, but what to do when things don't (immediately) work out? Have a packet that got lost? A contract that won't deploy?

Let's take a look at what the IBC SDK provides to troubleshoot when things are going wrong.

```sh
> ibctl -h

# terminal output relevant to metrics & troubleshooting
Commands:
    ...
    logs [options] <name>                                     Fetches the logs from any component of the stack. It mimics the `docker logs` functionality with similar options.
    trace-packets <endpoint-a> <endpoint-b>                   Trace packet execution over the specified endpoints. The endpoint format must be `chain_id:account_name_or_address`
    ...
```

## Logging with the `logs` command

A first good step when troubleshooting is to inspect the logs. If you're familiar with Docker logs, this will feel very similar.

Let's consult the help command and look at the options:

```sh
> bin/ibctl logs -h

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

> Tip: get familiar with the relayer logs as they will be especially important when dealing with IBC related behaviour.

## Packet tracing

<!-- Not included for private testnet iirc -->

🚧 Currently work in progress... 🚧
