# Build stage: versione Rust pinnata ESATTAMENTE a 1.99.1, identica a quella
# usata in locale (che compila i test 6/6). Il tag "1.99" fluttuante può
# risolvere una patch più nuova con regressioni e causare errori a cascata.
FROM rust:1.99.1-slim AS build
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
