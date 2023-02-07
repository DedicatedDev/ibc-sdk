FROM gaia-build:latest as build

FROM alpine:edge

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
COPY --from=build /usr/local/bin/gaiad /usr/local/bin/

ENTRYPOINT ["/entrypoint.sh"]
