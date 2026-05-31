param(
  [int]$Port = 9222,
  [switch]$NoMcpServer,
  [int]$TimeoutSeconds = 30
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$serverPath = Join-Path $repoRoot 'src\server.js'

function Stop-MatchingProcess {
  param(
    [string]$NamePattern,
    [string]$CommandLinePattern
  )

  $processes = Get-CimInstance Win32_Process |
    Where-Object {
      ($NamePattern -and $_.Name -match $NamePattern) -or
      ($CommandLinePattern -and $_.CommandLine -match $CommandLinePattern)
    }

  foreach ($process in $processes) {
    try {
      Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
      Write-Host "Stopped process $($process.ProcessId): $($process.Name)"
    } catch {
      Write-Warning "Could not stop process $($process.ProcessId): $($_.Exception.Message)"
    }
  }
}

function Get-TradingViewExecutable {
  $package = Get-AppxPackage -Name 'TradingView.Desktop*' | Select-Object -First 1
  if ($package -and $package.InstallLocation) {
    $candidate = Join-Path $package.InstallLocation 'TradingView.exe'
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  $candidates = @(
    "$env:LOCALAPPDATA\TradingView\TradingView.exe",
    "$env:ProgramFiles\TradingView\TradingView.exe",
    "${env:ProgramFiles(x86)}\TradingView\TradingView.exe"
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }

  throw "TradingView.exe not found. Install TradingView Desktop or update this script with the executable path."
}

function Wait-ForCdp {
  param(
    [int]$Port,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2
      if ($response.Content) {
        return $response.Content | ConvertFrom-Json
      }
    } catch {
      Start-Sleep -Milliseconds 750
    }
  }

  throw "CDP did not become ready on port $Port within $TimeoutSeconds seconds."
}

Write-Host "Stopping TradingView MCP server processes..."
$serverPattern = [regex]::Escape($serverPath)
Stop-MatchingProcess -CommandLinePattern $serverPattern
Stop-MatchingProcess -CommandLinePattern 'tradingview-mcp[\\/]+src[\\/]+server\.js'

Write-Host "Stopping TradingView Desktop processes..."
Stop-MatchingProcess -NamePattern '^TradingView(\.exe)?$'

Start-Sleep -Seconds 2

$tvExe = Get-TradingViewExecutable
Write-Host "Starting TradingView: $tvExe"
Start-Process -FilePath $tvExe -ArgumentList "--remote-debugging-port=$Port" -WindowStyle Hidden

Write-Host "Waiting for CDP on port $Port for up to $TimeoutSeconds seconds..."
$cdpVersion = Wait-ForCdp -Port $Port -TimeoutSeconds $TimeoutSeconds
Write-Host "CDP ready: $($cdpVersion.webSocketDebuggerUrl)"

if (-not $NoMcpServer) {
  Write-Host "Starting fresh TradingView MCP server: $serverPath"
  Start-Process -FilePath 'node' -ArgumentList "`"$serverPath`"" -WorkingDirectory $repoRoot -WindowStyle Hidden
  Start-Sleep -Seconds 1
}

$mcpProcesses = Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match $serverPattern -or $_.CommandLine -match 'tradingview-mcp[\\/]+src[\\/]+server\.js' } |
  Select-Object ProcessId, Name, CommandLine

$tvProcesses = Get-Process |
  Where-Object { $_.ProcessName -like '*TradingView*' } |
  Select-Object Id, ProcessName, Path

[pscustomobject]@{
  success = $true
  port = $Port
  cdp_ready = $true
  tradingview_exe = $tvExe
  tradingview_processes = $tvProcesses
  mcp_processes = $mcpProcesses
} | ConvertTo-Json -Depth 5
