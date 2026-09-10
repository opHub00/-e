Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath([float]$size, [float]$radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $radius * 2
  $path.AddArc(0, 0, $diameter, $diameter, 180, 90)
  $path.AddArc($size - $diameter, 0, $diameter, $diameter, 270, 90)
  $path.AddArc($size - $diameter, $size - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc(0, $size - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-WanpaneIcon([int]$size, [bool]$fullBackground, [string]$outputPath) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $purple = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#4F3AA8'))
  $surface = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#FCF8FF'))
  $lavender = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#DDD7FF'))
  $mint = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#80D8B0'))
  $ink = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#26352E'), [Math]::Max(2, $size * 0.0234))
  $ink.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $ink.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $ink.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  if ($fullBackground) {
    $graphics.FillRectangle($purple, 0, 0, $size, $size)
  } else {
    $background = New-RoundedRectanglePath $size ($size * 0.23)
    $graphics.FillPath($purple, $background)
    $background.Dispose()
  }

  $scale = $size / 512.0
  $house = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(120 * $scale, 240 * $scale),
    [System.Drawing.PointF]::new(256 * $scale, 128 * $scale),
    [System.Drawing.PointF]::new(392 * $scale, 240 * $scale),
    [System.Drawing.PointF]::new(392 * $scale, 387 * $scale),
    [System.Drawing.PointF]::new(369 * $scale, 410 * $scale),
    [System.Drawing.PointF]::new(143 * $scale, 410 * $scale),
    [System.Drawing.PointF]::new(120 * $scale, 387 * $scale)
  )
  $graphics.FillPolygon($surface, $house)
  $graphics.FillRectangle($lavender, 200 * $scale, 301 * $scale, 112 * $scale, 109 * $scale)
  $graphics.FillEllipse($mint, 291 * $scale, 184 * $scale, 70 * $scale, 70 * $scale)
  $graphics.DrawLines($ink, [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(309 * $scale, 219 * $scale),
    [System.Drawing.PointF]::new(321 * $scale, 231 * $scale),
    [System.Drawing.PointF]::new(343 * $scale, 206 * $scale)
  ))

  $directory = Split-Path -Parent $outputPath
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
  $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $ink.Dispose()
  $mint.Dispose()
  $lavender.Dispose()
  $surface.Dispose()
  $purple.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

$publicRoot = Join-Path $PSScriptRoot '..\public'
New-WanpaneIcon 192 $false (Join-Path $publicRoot 'icons\wanpane-192.png')
New-WanpaneIcon 512 $false (Join-Path $publicRoot 'icons\wanpane-512.png')
New-WanpaneIcon 512 $true (Join-Path $publicRoot 'icons\wanpane-maskable-512.png')
New-WanpaneIcon 180 $true (Join-Path $publicRoot 'apple-touch-icon.png')
