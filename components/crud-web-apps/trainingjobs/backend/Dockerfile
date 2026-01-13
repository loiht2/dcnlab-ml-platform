# Build stage
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git ca-certificates

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# Runtime stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/main .

# Create non-root user (UID 65532 is commonly used for 'nonroot' user)
RUN adduser -D -u 65532 -g "" nonroot && \
    chown -R nonroot:nonroot /app

# Switch to non-root user
USER nonroot

# Expose port
EXPOSE 8080

# Use ENTRYPOINT so args work correctly in K8s
ENTRYPOINT ["/app/main"]
