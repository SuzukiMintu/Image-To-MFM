import copy
import numpy as np
from PIL import Image

#==================================================
# 画像用関数
#==================================================

### @brief リサイズの値を計算する関数
### @param img_size 画像のサイズ (width, height)
### @param resize_value リサイズの値 (width, height)
### @return リサイズ後の幅と高さのタプル。両方とも0以下の場合はNoneを返す。
def CalculateResizeValue(img_size, resize_value):
    print(f"Calculating resize value for image size: {img_size} with resize value: {resize_value}")

    # 縦幅も横幅も設定されているならそのまま返す
    if resize_value[0] > 0 and resize_value[1] > 0:
        return resize_value[0], resize_value[1]
    # 縦幅も横幅も設定されていない場合もそのまま返す
    elif resize_value[0] <= 0 and resize_value[1] <= 0:
        return resize_value[0], resize_value[1]
    
    resize_width, resize_height = resize_value

    try:
        width, height = img_size
        ratio = 1.0

        if resize_width <= 0:
            # 横幅が設定されていない場合の計算
            ratio = width / height
            resize_width = int(resize_height * ratio)

        elif resize_height <= 0:
            # 縦幅が設定されていない場合の計算
            ratio = height / width
            resize_height = int(resize_width * ratio)
        
        return resize_width, resize_height

    except Exception as e:
        print(f"Error calculating resize value: {e}")
        return None, None

### @brief pngファイルリサイズ関数
### @param img 画像オブジェクト
### @param resize_value リサイズの値 (width, height)
### @return リサイズ後の画像オブジェクト。リサイズに失敗した場合はNoneを返す。
def ResizePngFile(img, resize_value):
    print(f"Resizing image to: {resize_value}")
    # リサイズの値が無効ならそのままにする
    if (resize_value[0] <= 0) and (resize_value[1] <= 0):
        print("Retain size.")
        return img

    try:
        img = img.resize(resize_value)
        return img

    except Exception as e:
        print(f"Error resizing image: {e}")
        return None

### @brief 背景色設定用関数
### @param img 画像オブジェクト
### @param background_color 背景色 (R, G, B, A)
### @return 背景色が設定された画像オブジェクト。失敗した場合はNoneを返す。
def SetBackgroundColor(img, background_color):
    print(f"Setting background color: {background_color}")

    # 背景色が無効ならそのままにする
    if (background_color[0] < 0) or (background_color[1] < 0) or (background_color[2] < 0) or (background_color[3] < 0):
        print("Invalid background color. Retain original image.")
        return img

    try:
        # 背景画像を作成
        background = Image.new('RGBA', img.size, background_color)
        # 背景画像と元の画像を合成
        new_img = Image.alpha_composite(background, img)
        return new_img

    except Exception as e:
        print(f"Error setting background color: {e}")
        return None