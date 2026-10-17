# Build stage: versione Rust pinnata a 1.99 (uguale a quella usata in locale, che
# compila correttamente). Il tag "1" fluttuante può risolvere un toolchain diverso
# e causare errori a cascata su tutte le crate.
FROM rust:1.99 AS build
WORKDIR /app
COPY . .
# Build pulita: rimuove eventuali artefatti target/ trascinati dal context.
RUN rm -rf target && cargo build --release

# Runtime stage
FROM debian:bookworm-slim
WORKDIR /app
COPY --from=build /app/target/release/burraco-server /usr/local/bin/burraco-server
EXPOSE 3000
CMD ["burraco-server", "--serve"]
