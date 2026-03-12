# Stage 1: Build frontend
FROM node:20-alpine AS frontend
WORKDIR /app
COPY package.json ./
RUN npm install
COPY index.html vite.config.js tailwind.config.js postcss.config.js ./
COPY src/ src/
RUN npm run build

# Stage 2: Build Go backend
FROM golang:1.22-alpine AS backend
RUN apk add --no-cache gcc musl-dev
WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/*.go ./
RUN CGO_ENABLED=1 go build -ldflags="-s -w" -o cpa-center .

# Stage 3: Final image
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=backend /app/cpa-center .
COPY --from=frontend /app/dist ./dist/
RUN mkdir -p data

ENV PORT=7940
ENV CPA_BASE_DIR=/app
EXPOSE 7940

CMD ["./cpa-center"]
