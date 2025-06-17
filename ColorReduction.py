import copy
import numpy as np

#==================================================
# 減色処理用関数
#==================================================

### @brief pngファイルから色だけを抽出した配列に変換する関数
### @param img 画像オブジェクト
### @return 色の配列 (辞書型3次元配列)。変換に失敗した場合はNoneを返す。
def ConvertPngToArray(img):
    print("Converting PNG to color array.")

    try:
        # 画像のピクセルの色を取得
        color_array = np.zeros((img.height, img.width, 4), dtype=np.uint8)
        for y in range(img.size[1]):
            for x in range(img.size[0]):
                pixel = img.getpixel((x, y))
                color_array[y][x] = [pixel[0], pixel[1], pixel[2], pixel[3]]

        return color_array

    except Exception as e:
        print(f"Error converting PNG to array: {e}")
        return None

### @brief 隣合う色の平均値を出して滑らかにする関数
### @param color_array 色の配列 (R, G, B, A)
### @return 平均値を求めたあとの色の配列
def SmoothColor(color_array):
    height = len(color_array)
    width = len(color_array[0])
    smoothed_array = copy.deepcopy(color_array)

    for y in range(height):
        for x in range(width):
            current_color = color_array[y][x]

            # 現在のピクセルが透明なら処理せずそのまま適用
            if current_color[3] == 0:
                smoothed_array[y][x] = current_color
                continue

            # 隣接ピクセルの取得（透明なピクセルは除外）
            neighbor_colors = [current_color]

            if (x > 0) and (color_array[y][x - 1][3] != 0):
                neighbor_colors.append(color_array[y][x - 1])

            if (x < width - 1) and (color_array[y][x + 1][3] != 0):
                neighbor_colors.append(color_array[y][x + 1])

            # 隣接ピクセルがない場合は現在の色をそのまま適用
            if len(neighbor_colors) == 1:
                smoothed_array[y][x] = current_color
                continue
            
            # 各色成分を計算
            averaged_color = []
            # RGBAの各値ごとに計算
            for i in range(4):
                total = 0.0
                # 平均値計算
                for color in neighbor_colors:
                    total += color[i]
                avg = total / len(neighbor_colors)
                averaged_color.append(int(avg))
                
            smoothed_array[y][x] = averaged_color
            
    return smoothed_array

### @brief 色を割り算で減色する関数
### @param color_array 色の配列 (R, G, B, A)
### @param division 割り算の値 (1以上の値)
### @return 割り算後の色 (R, G, B, A)。割り算に失敗した場合はNoneを返す。
def DivideColor(color_array, division):
    print(f"Dividing color by: {division}")

    if division < 1:
        print("Division value must be 1 or greater.")
        return None
    elif division == 1:
        # 割り算値が1の場合はそのまま返す
        return copy.deepcopy(color_array)

    try:
        new_color_array = copy.deepcopy(color_array)
        # 割り算後の色を計算
        for y in range(len(color_array)):
            for x in range(len(color_array[0])):
                r, g, b, a = color_array[y][x]
                # 各成分を割り算。アルファ値はそのまま
                r = int(r / division)
                g = int(g / division)
                b = int(b / division)
                # 割り算した分を掛け算して元の色に近づける
                # このとき division の半分の値を足して平均化する
                r = min(int(r * division) + int(division / 2), 255)
                g = min(int(g * division) + int(division / 2), 255)
                b = min(int(b * division) + int(division / 2), 255)
                
                # 計算後の色を更新
                new_color_array[y][x] = [r, g, b, a]

        return new_color_array

    except Exception as e:
        print(f"Error dividing color: {e}")
        return None
