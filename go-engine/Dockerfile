# Stage 1: Build binary
FROM golang:1.25-alpine AS builder
WORKDIR /app

ENV GOTOOLCHAIN=auto

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /go-engine main.go

# Stage 2: Minimal runtime image (~15MB)
FROM alpine:3.20 AS runner
WORKDIR /app

RUN apk --no-cache add ca-certificates

COPY --from=builder /go-engine /go-engine

CMD ["/go-engine"]