from PIL import Image, ImageDraw

def generate_board_image(filled_count):
    # Create a new white image
    img = Image.new('RGB', (300, 300), 'white')  # 10x10 tiles, each 30x30 pixels
    draw = ImageDraw.Draw(img)

    tile_size = 30

    # Draw the filled tiles
    for i in range(filled_count):
        row = i // 10
        col = i % 10
        x0 = col * tile_size
        y0 = row * tile_size
        x1 = x0 + tile_size
        y1 = y0 + tile_size
        draw.rectangle([x0, y0, x1, y1], fill='black')  # Fill with black color

    return img

def save_board_to_file(img, file_number):
    img.save(f'board_{file_number}.jpg')

def main():
    for i in range(1, 101):
        img = generate_board_image(i)
        save_board_to_file(img, i)

if __name__ == "__main__":
    main()
