$webDir = Resolve-Path "$PSScriptRoot\..\web-console"

# Install dependencies if node_modules is missing
if (-not (Test-Path "$webDir\node_modules")) {
    Write-Host "node_modules not found — running npm install..."
    Push-Location $webDir
    npm.cmd install
    Pop-Location
}

# No .env.local required — CENTRAL_SERVER_URL defaults to http://localhost:10000
# (hardcoded in web-console/lib/api/client.ts).
# Only create .env.local if the central-server runs on a different host/port.
Write-Host "Starting Next.js web console on http://localhost:3000"
Write-Host ""

Push-Location $webDir
try {
    npm.cmd run dev
} finally {
    Pop-Location
}
