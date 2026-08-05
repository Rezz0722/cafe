# راه‌اندازی/توقف سرور MySQL محلی.
#
# سرور به‌صورت zip (بدون نصب) در C:\mysql پیاده شده و به‌عنوان سرویس ویندوز
# ثبت نشده، پس با ری‌استارت ماشین بالا نمی‌آید. این اسکریپت همان کار را
# دستی می‌کند.
#
#   powershell -File scripts/mysql-service.ps1 start
#   powershell -File scripts/mysql-service.ps1 stop
#   powershell -File scripts/mysql-service.ps1 status

param(
  [Parameter(Position = 0)]
  [ValidateSet('start', 'stop', 'status')]
  [string]$Action = 'status'
)

$MysqlBin = 'C:\mysql\mysql-8.4.11-winx64\bin'
$Defaults = 'C:\mysql\my.ini'

function Get-MysqlProcess {
  Get-Process -Name mysqld -ErrorAction SilentlyContinue
}

switch ($Action) {
  'start' {
    if (Get-MysqlProcess) {
      Write-Output 'MySQL از قبل در حال اجراست.'
      break
    }
    Start-Process -FilePath "$MysqlBin\mysqld.exe" -ArgumentList "--defaults-file=$Defaults" -WindowStyle Hidden
    Start-Sleep -Seconds 10
    if (Get-MysqlProcess) {
      Write-Output 'MySQL بالا آمد روی 127.0.0.1:3306'
    } else {
      Write-Output 'بالا نیامد — لاگ خطا:'
      Get-Content 'C:\mysql-data\error.log' -Tail 20
      exit 1
    }
  }
  'stop' {
    if (-not (Get-MysqlProcess)) {
      Write-Output 'MySQL در حال اجرا نیست.'
      break
    }
    # خاموشیِ تمیز — kill کردن مستقیم می‌تواند InnoDB را نیازمند recovery کند.
    & "$MysqlBin\mysqladmin.exe" --host 127.0.0.1 --user root shutdown
    Start-Sleep -Seconds 5
    if (Get-MysqlProcess) { Write-Output 'هنوز در حال اجراست.'; exit 1 }
    Write-Output 'MySQL خاموش شد.'
  }
  'status' {
    $proc = Get-MysqlProcess
    if ($proc) {
      Write-Output "در حال اجرا — PID $($proc.Id)"
      & "$MysqlBin\mysql.exe" --host 127.0.0.1 --user root -e 'SELECT VERSION() AS version;'
    } else {
      Write-Output 'در حال اجرا نیست.'
    }
  }
}
