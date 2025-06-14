import copy
import numpy as np
from PIL import Image

#==================================================
# 関数定義
#==================================================

### @brief 文字列の先頭を、指定の文字でn文字まで埋める関数
### @param string 対象の文字列
### @param n 目標の文字列長
### @param char 埋める文字列（デフォルトは"0"）
### @return 埋められた文字列
def StringHeadFill(string, n, char = "0"):
    if len(string) < n:
        string = char * (n - len(string)) + string
    return string

### @brief オプションファイルの読み込み関数
### @param file_path 読み込むオプションファイルのパス
### @return 読み込んだオプションの辞書。読み込みに失敗した場合はNoneを返す。
def LoadOptionFile(file_path):
    print(f"Loading option file from: {file_path}")

    # 読み込み用変数
    option_file = []
    filename = ""
    note_or_page = -1
    resize_width = -1
    resize_height = -1
    color_division = 0
    color_type = -1
    
    # ファイル読み込み
    try:
        with open(file_path, "r", encoding="UTF-8") as file:
            option_file = file.read().splitlines()
    except Exception as e:
        print(f"Error loading option file: {e}")
        return None

    while option_file:
        line = option_file.pop(0).strip()
        
        # コメント行や空行のスキップ
        if line.startswith("#") or not line:
            continue

        if line.startswith("filename"):
            filename = line.split(" = ", 1)[1].strip()

        elif line.startswith("note_or_page"):
            note_or_page = int(line.split(" = ", 1)[1].strip())

        elif line.startswith("resize_width"):
            resize_width = int(line.split(" = ", 1)[1].strip())

        elif line.startswith("resize_height"):
            resize_height = int(line.split(" = ", 1)[1].strip())

        elif line.startswith("color_division"):
            color_division = float(line.split(" = ", 1)[1].strip())

        elif line.startswith("color_type"):
            color_type = int(line.split(" = ", 1)[1].strip())

    return {
        "filename": filename,
        "note_or_page": note_or_page,
        "resize_width": resize_width,
        "resize_height": resize_height,
        "color_division": color_division,
        "color_type": color_type
    }

### @brief pngファイル読み込み関数
### @param filename 読み込むpngファイルのパス
### @return 読み込んだ画像オブジェクト。読み込みに失敗した場合はNoneを返す。
def LoadPngFile(filename):
    print(f"Loading PNG file from: {filename}")

    try:
        img = Image.open(filename).convert("RGBA")
        return img

    except Exception as e:
        print(f"Error loading image: {e}")
        return None

### @brief リサイズの値を計算する関数
### @param img_size 画像のサイズ (width, height)
### @param resize_value リサイズの値 (width, height)
### @return リサイズ後の幅と高さのタプル。両方とも0以下の場合はNoneを返す。
def CalculateResizeValue(img_size, resize_value):
    print(f"Calculating resize value for image size: {img_size} with resize value: {resize_value}")

    # 縦幅も横幅も設定されているならそのまま返す
    if resize_value[0] > 0 and resize_value[1] > 0:
        return resize_value[0], resize_value[1]
    # 縦幅も横幅も設定されていないなら None を返す
    elif resize_value[0] <= 0 and resize_value[1] <= 0:
        return None, None
    
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

    try:
        img = img.resize(resize_value)
        return img

    except Exception as e:
        print(f"Error resizing image: {e}")
        return None

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

### @brief RGBA値を文字列に変換する関数
### @param color 色 (R, G, B, A)
### @param color_type 色の形式（0: 6桁RGB, 1: 3桁RGB, 2: 4桁RGBA）
### @return 色コード文字列（例: "ffaaff", "f8f8" など）
def ConvertColorToString(color, color_type):
    r, g, b, a = color
    r = StringHeadFill(format(r, 'x'), 2)
    g = StringHeadFill(format(g, 'x'), 2)
    b = StringHeadFill(format(b, 'x'), 2)
    a = StringHeadFill(format(a, 'x'), 2)

    if color_type == 0:
        # 6桁RGB形式
        return f"{r}{g}{b}"

    elif color_type == 1:
        # 3桁RGB形式
        r = r[0]
        g = g[0]
        b = b[0]
        return f"{r}{g}{b}"

    elif color_type == 2:
        # 4桁RGBA形式
        r = r[0]
        g = g[0]
        b = b[0]
        if (a[0] == "f"):
            a = ""
        else:
            a = a[0]
        return f"{r}{g}{b}{a}"
    else:
        print(f"Invalid color type: {color_type}")
        return None

### @brief MFMアートの文字列生成関数
### @param color_array 色の配列 (辞書型3次元配列)
### @param color_type 色の形式（0: 6桁RGB, 1: 3桁RGB, 2: 4桁RGBA）
### @param scale MFMのスケール文字列
### @param space_char 空白として使用する文字
def GenerateMFM(color_array, color_type, scale, space_char):
    print("Generating MFM.")

    try:
        mfm_text = scale
        pre_bg_color = []   # 前の背景色
        bg_color = []       # 現在の背景色

        for y in range(len(color_array)):
            # 現在色を塗っている(前のbg.colorが続いている)かのフラグ
            is_bg_color_continue = False
            # スペース分の文字列
            mfm_space = ""

            for x in range(len(color_array[0])):
                rgba = color_array[y][x]

                # 色を文字列に変換
                color_str = ConvertColorToString(rgba, color_type)
                pre_bg_color = bg_color
                bg_color = color_str

                if (color_type == 2):
                    # 4桁RGBA形式の場合、アルファ値を取得
                    alpha = int(rgba[3])
                else:
                    # それ以外の形式ではアルファ値は常に255（不透明）とする
                    alpha = 255

                # 背景色が透明でなく、かつ変わった場合の処理
                if (alpha != 0) and (pre_bg_color != bg_color):
                    # 参照位置が行の初めでなく、現時点でbg.colorが続いている場合は閉じる
                    if (x != 0) and is_bg_color_continue:
                        mfm_text += "]"
                    mfm_text += f"{mfm_space}$[bg.color={bg_color} "
                    mfm_space = ""
                    is_bg_color_continue = True

                elif (alpha == 0) and is_bg_color_continue:
                    # 背景色が透明になった場合は閉じる
                    mfm_text += "]"
                    is_bg_color_continue = False

                # スペースの追加
                if not is_bg_color_continue:
                    mfm_space += space_char
                if is_bg_color_continue:
                    mfm_text += space_char

            # 行の終わりでbg.colorが続いている場合は閉じる
            if is_bg_color_continue:
                mfm_text += "]"
            # 最後の行でなければ改行を追加
            if y != len(color_array) - 1:
                mfm_text += "\n"

        # スケールのMFMアートの終端
        mfm_text += "]"
        return mfm_text

    except Exception as e:
        print(f"Error exporting MFM art: {e}")
        return None

### @brief MFMアートをファイルに保存する関数
### @param mfm_text MFMアートの文字列
### @param filename 保存するファイル名（拡張子は自動的に.txtが付与される）
def OutputMFMArt(mfm_text, filename):
    print(f"Saving MFM art to: {filename}.txt")

    try:
        with open(f"{filename}.txt", "w", encoding="UTF-8") as mfm_file:
            mfm_file.write(mfm_text)
        print(f"MFM art saved to {filename}.txt")
        return True

    except Exception as e:
        print(f"Error saving MFM art: {e}")
        return False