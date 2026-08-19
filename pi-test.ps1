$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$noEnv = $false
$forwardArgs = New-Object System.Collections.Generic.List[string]

foreach ($arg in $args) {
	if ($arg -eq "--no-env") {
		$noEnv = $true
	} else {
		$forwardArgs.Add($arg)
	}
}

if ($noEnv) {
	$envVarsToUnset = @(
		"ANTHROPIC_API_KEY",
		"ANTHROPIC_OAUTH_TOKEN",
		"OPENAI_API_KEY",
		"GEMINI_API_KEY"
	)

	foreach ($name in $envVarsToUnset) {
		Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
	}

	Write-Host "Running without API keys..."
}

$tsxBin = Join-Path $scriptDir "node_modules/.bin/tsx.cmd"
if (-not (Test-Path -LiteralPath $tsxBin)) {
	throw "tsx not found at $tsxBin. Run npm install from the repo root first."
}

$cliPath = Join-Path $scriptDir "packages/coding-agent/src/cli.ts"
& $tsxBin --tsconfig (Join-Path $scriptDir "tsconfig.json") $cliPath @forwardArgs
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
	exit $exitCode
}
