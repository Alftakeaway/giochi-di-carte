# Build stage
FROM rust:1-slim AS build
WORKDIR /app
COPY . .
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim
WORKDIR /app
COPY --from=build /app/target/release/burraco-server /usr/local/bin/burraco-server
EXPOSE 3000
CMD ["burraco-server", "--serve"]
