@echo off
REM Fully restart TradingView Desktop plus local TradingView MCP server on Windows.
REM Usage: scripts\restart_tv_mcp_debug.bat [port]

set PORT=%1
if "%PORT%"=="" set PORT=9222

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart_tv_mcp_debug.ps1" -Port %PORT%
