$env:AI_GATEWAY_HTTP_HOST     = "0.0.0.0"
$env:AI_GATEWAY_HTTP_PORT     = "10000"
$env:AI_GATEWAY_DB_HOST       = "ai.database"
$env:AI_GATEWAY_DB_PORT       = "5432"
$env:AI_GATEWAY_DB_USER       = "pangreksa"
$env:AI_GATEWAY_DB_PASSWORD   = "devpassword"
$env:AI_GATEWAY_DB_NAME       = "aigateway1"
$env:AI_GATEWAY_DB_SSLMODE    = "disable"

$serverDir = Resolve-Path "$PSScriptRoot\..\central-server"
$exe = "$serverDir\central-server.exe"

Write-Host "Building central-server..."
Push-Location $serverDir
go build -o central-server.exe ./cmd/server
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed."
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "Build complete."

Write-Host "Starting central-server on http://0.0.0.0:10000"
& $exe
