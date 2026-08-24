#!/usr/bin/env python3
"""
Generate custom Kamix app icons and splash screen for Android.

Creates:
- App icons in all densities (mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi)
- Adaptive icon foreground (108dp) and background
- Round launcher icons
- Splash screen (1080x1920)
"""

from PIL import Image, ImageDraw, ImageFont
import os

# Brand colors
TEAL = (45, 106, 79)  # #2D6A4F - Forest Green primary
DARK_TEAL = (33, 80, 59)  # #21503B - darker shade
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)

# Icon sizes per density
ICON_SIZES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}

# Adaptive icon sizes (108dp at each density)
ADAPTIVE_SIZES = {
    'mipmap-mdpi': 108,
    'mipmap-hdpi': 162,
    'mipmap-xhdpi': 216,
    'mipmap-xxhdpi': 324,
    'mipmap-xxxhdpi': 432,
}

RES_DIR = 'android/app/src/main/res'


def draw_k_logo(img, size, padding_pct=0.2):
    """Draw the Kamix 'K' logo on an image."""
    draw = ImageDraw.Draw(img)
    
    # Draw a rounded-rectangle "K" letter
    # The K is made of a vertical bar + two diagonal arms
    w, h = img.size
    pad = int(w * padding_pct)
    
    # Main vertical bar of K
    bar_width = int(w * 0.18)
    bar_x = pad
    bar_top = pad
    bar_bottom = h - pad
    
    draw.rounded_rectangle(
        [bar_x, bar_top, bar_x + bar_width, bar_bottom],
        radius=int(bar_width * 0.25),
        fill=WHITE
    )
    
    # Upper diagonal arm
    arm_width = int(w * 0.14)
    center_x = bar_x + bar_width // 2
    center_y = h // 2
    
    # Upper arm: from center-left to top-right
    upper_points = [
        (bar_x + bar_width, center_y - int(h * 0.05)),
        (bar_x + bar_width + int(w * 0.05), center_y - int(h * 0.02)),
        (w - pad, pad),
        (w - pad - int(w * 0.08), pad),
        (center_x + int(w * 0.02), center_y - int(h * 0.02)),
    ]
    draw.polygon(upper_points, fill=WHITE)
    
    # Lower arm: from center-left to bottom-right
    lower_points = [
        (bar_x + bar_width, center_y + int(h * 0.05)),
        (bar_x + bar_width + int(w * 0.05), center_y + int(h * 0.02)),
        (w - pad, h - pad),
        (w - pad - int(w * 0.08), h - pad),
        (center_x + int(w * 0.02), center_y + int(h * 0.02)),
    ]
    draw.polygon(lower_points, fill=WHITE)
    
    return img


def draw_k_logo_simple(img, size):
    """Draw a simpler, cleaner Kamix K logo."""
    draw = ImageDraw.Draw(img)
    w, h = img.size
    
    # Calculate proportions
    margin = int(w * 0.22)
    bar_w = int(w * 0.2)
    arm_w = int(w * 0.15)
    
    # Vertical bar
    draw.rounded_rectangle(
        [margin, margin, margin + bar_w, h - margin],
        radius=int(bar_w * 0.3),
        fill=WHITE
    )
    
    # Diagonal arms as thick lines
    cx = margin + bar_w // 2
    cy = h // 2
    
    # Upper arm
    draw.polygon([
        (margin + bar_w - 2, cy),
        (w - margin, margin),
        (w - margin, margin + int(h * 0.12)),
        (margin + bar_w + int(w * 0.08), cy),
    ], fill=WHITE)
    
    # Lower arm  
    draw.polygon([
        (margin + bar_w - 2, cy),
        (w - margin, h - margin),
        (w - margin, h - margin - int(h * 0.12)),
        (margin + bar_w + int(w * 0.08), cy),
    ], fill=WHITE)
    
    return img


def create_square_icon(size, output_path):
    """Create a standard square launcher icon."""
    img = Image.new('RGB', (size, size), TEAL)
    draw_k_logo_simple(img, size)
    img.save(output_path)
    print(f"  Created: {output_path} ({size}x{size})")


def create_round_icon(size, output_path):
    """Create a round launcher icon with circular mask."""
    # Create at slightly larger size for anti-aliasing
    render_size = size * 2
    img = Image.new('RGBA', (render_size, render_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Draw circle background
    draw.ellipse([0, 0, render_size - 1, render_size - 1], fill=TEAL + (255,))
    
    # Draw K logo on top
    draw_k_logo_simple(img, render_size)
    
    # Resize to target
    img = img.resize((size, size), Image.LANCZOS)
    img.save(output_path)
    print(f"  Created: {output_path} ({size}x{size})")


def create_adaptive_foreground(size, output_path):
    """Create adaptive icon foreground (108dp) - K logo centered."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # The safe zone is the center 66/108 = ~61% of the canvas
    # Draw K logo in the safe zone
    margin = int(size * 0.18)
    draw.rounded_rectangle(
        [margin, margin, margin + int(size * 0.18), size - margin],
        radius=int(size * 0.05),
        fill=WHITE + (255,)
    )
    
    cx = margin + int(size * 0.09)
    cy = size // 2
    
    # Upper arm
    draw.polygon([
        (margin + int(size * 0.18), cy),
        (size - margin, margin),
        (size - margin, margin + int(size * 0.1)),
        (margin + int(size * 0.25), cy),
    ], fill=WHITE + (255,))
    
    # Lower arm
    draw.polygon([
        (margin + int(size * 0.18), cy),
        (size - margin, size - margin),
        (size - margin, size - margin - int(size * 0.1)),
        (margin + int(size * 0.25), cy),
    ], fill=WHITE + (255,))
    
    img.save(output_path)
    print(f"  Created: {output_path} ({size}x{size})")


def create_adaptive_background(size, output_path):
    """Create adaptive icon background - solid teal."""
    img = Image.new('RGB', (size, size), TEAL)
    img.save(output_path)
    print(f"  Created: {output_path} ({size}x{size})")


def create_splash_screen(width=1080, height=1920, output_path=None):
    """Create a splash screen with Kamix branding."""
    if output_path is None:
        output_path = f'{RES_DIR}/drawable/splash.png'
    
    img = Image.new('RGB', (width, height), TEAL)
    draw = ImageDraw.Draw(img)
    
    # Draw a subtle gradient effect (darker at bottom)
    for y in range(height):
        ratio = y / height
        r = int(TEAL[0] * (1 - ratio * 0.3) + DARK_TEAL[0] * ratio * 0.3)
        g = int(TEAL[1] * (1 - ratio * 0.3) + DARK_TEAL[1] * ratio * 0.3)
        b = int(TEAL[2] * (1 - ratio * 0.3) + DARK_TEAL[2] * ratio * 0.3)
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    
    # Draw K logo in center
    logo_size = int(width * 0.35)
    logo_img = Image.new('RGBA', (logo_size, logo_size), (0, 0, 0, 0))
    draw_k_logo_simple(logo_img, logo_size)
    
    # Center the logo
    logo_x = (width - logo_size) // 2
    logo_y = (height - logo_size) // 2 - int(height * 0.05)
    
    # Paste logo with alpha
    img.paste(logo_img, (logo_x, logo_y), logo_img)
    
    # Draw "KAMIX" text below logo
    try:
        font_size = int(width * 0.08)
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except:
        font = ImageFont.load_default()
    
    text = "KAMIX"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_x = (width - text_w) // 2
    text_y = logo_y + logo_size + int(height * 0.04)
    
    draw.text((text_x, text_y), text, fill=WHITE, font=font)
    
    img.save(output_path, quality=95)
    print(f"  Created splash: {output_path} ({width}x{height})")


def create_splash_land(width=1920, height=1080, output_path=None):
    """Create landscape splash screen."""
    if output_path is None:
        output_path = f'{RES_DIR}/drawable-land-hdpi/splash.png'
    
    img = Image.new('RGB', (width, height), TEAL)
    draw = ImageDraw.Draw(img)
    
    # Gradient
    for y in range(height):
        ratio = y / height
        r = int(TEAL[0] * (1 - ratio * 0.2) + DARK_TEAL[0] * ratio * 0.2)
        g = int(TEAL[1] * (1 - ratio * 0.2) + DARK_TEAL[1] * ratio * 0.2)
        b = int(TEAL[2] * (1 - ratio * 0.2) + DARK_TEAL[2] * ratio * 0.2)
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    
    # Logo
    logo_size = int(height * 0.35)
    logo_img = Image.new('RGBA', (logo_size, logo_size), (0, 0, 0, 0))
    draw_k_logo_simple(logo_img, logo_size)
    
    logo_x = (width - logo_size) // 2
    logo_y = (height - logo_size) // 2 - int(height * 0.03)
    img.paste(logo_img, (logo_x, logo_y), logo_img)
    
    # Text
    try:
        font_size = int(height * 0.08)
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except:
        font = ImageFont.load_default()
    
    text = "KAMIX"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_x = (width - text_w) // 2
    text_y = logo_y + logo_size + int(height * 0.03)
    
    draw.text((text_x, text_y), text, fill=WHITE, font=font)
    
    img.save(output_path, quality=95)
    print(f"  Created landscape splash: {output_path}")


def main():
    print("🎨 Generating Kamix app icons and splash screen...\n")
    
    # 1. Standard launcher icons
    print("📱 Standard launcher icons:")
    for density, size in ICON_SIZES.items():
        dir_path = f'{RES_DIR}/{density}'
        os.makedirs(dir_path, exist_ok=True)
        create_square_icon(size, f'{dir_path}/ic_launcher.png')
        create_round_icon(size, f'{dir_path}/ic_launcher_round.png')
    
    # 2. Adaptive icon foreground and background
    print("\n🖼️  Adaptive icon assets:")
    for density, size in ADAPTIVE_SIZES.items():
        dir_path = f'{RES_DIR}/{density}'
        os.makedirs(dir_path, exist_ok=True)
        create_adaptive_foreground(size, f'{dir_path}/ic_launcher_foreground.png')
        create_adaptive_background(size, f'{dir_path}/ic_launcher_background.png')
    
    # 3. Splash screen (portrait)
    print("\n🌊 Splash screen:")
    create_splash_screen()
    
    # 4. Landscape splash screens for all densities
    land_sizes = {
        'drawable-land-mdpi': (640, 480),
        'drawable-land-hdpi': (960, 720),
        'drawable-land-xhdpi': (1280, 960),
        'drawable-land-xxhdpi': (1920, 1440),
        'drawable-land-xxxhdpi': (2560, 1920),
    }
    
    for density, (w, h) in land_sizes.items():
        dir_path = f'{RES_DIR}/{density}'
        os.makedirs(dir_path, exist_ok=True)
        create_splash_land(w, h, f'{dir_path}/splash.png')
    
    # 5. Portrait splash screens for all densities
    port_sizes = {
        'drawable-port-mdpi': (480, 640),
        'drawable-port-hdpi': (720, 960),
        'drawable-port-xhdpi': (960, 1280),
        'drawable-port-xxhdpi': (1440, 1920),
        'drawable-port-xxxhdpi': (1920, 2560),
    }
    
    for density, (w, h) in port_sizes.items():
        dir_path = f'{RES_DIR}/{density}'
        os.makedirs(dir_path, exist_ok=True)
        create_splash_screen(w, h, f'{dir_path}/splash.png')
    
    print("\n✅ All icons and splash screens generated!")
    print(f"📁 Output directory: {RES_DIR}")


if __name__ == '__main__':
    main()
