from turtle import back
from PIL import Image

#=================================================
# ファイル読み込み用モジュール
#=================================================

### @brief オプションファイルの読み込み関数
### @param file_path 読み込むオプションファイルのパス
### @return 読み込んだオプションの辞書。読み込みに失敗した場合はNoneを返す。
def LoadOptionFile(file_path):
    print(f"Loading option file from: {file_path}")

    # 読み込み用変数
    option_file = []        # オプションファイルの文字を格納するリスト
    filename = ""           # 読み込む画像ファイル名
    use_scale_index = -1    # 使用するスケールのインデックス
    use_space_index = -1    # 使用するスペースのインデックス
    resize_width = -1       # リサイズ後の幅
    resize_height = -1      # リサイズ後の高さ
    smooth_repeat = 0       # 平均化の繰り返し回数
    color_division = 0      # 色の割り算値
    max_row_colors = 0      # 各行の最大色数
    color_type = -1         # 色の形式（0: 6桁RGB, 1: 3桁RGB, 2: 4桁RGBA）
    scale_preset = ["0.7"]  # スケールのプリセット
    space_preset = ["　"]   # スペースのプリセット
    background_color = (0, 0, 0, 0) # 背景色 (R, G, B, A)
    max_overlap_bg_color = 19       # 最大重複背景色数
    
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
            filename = line.split("=", 1)[1].strip()

        elif line.startswith("use_scale_index"):
            use_scale_index = int(line.split("=", 1)[1].strip())

        elif line.startswith("use_space_index"):
            use_space_index = int(line.split("=", 1)[1].strip())

        elif line.startswith("resize_width"):
            resize_width = int(line.split("=", 1)[1].strip())

        elif line.startswith("resize_height"):
            resize_height = int(line.split("=", 1)[1].strip())

        elif line.startswith("smooth_repeat"):
            smooth_repeat = int(line.split("=", 1)[1].strip())

        elif line.startswith("color_division"):
            color_division = float(line.split("=", 1)[1].strip())

        elif line.startswith("max_row_colors"):
            max_row_colors = int(line.split("=", 1)[1].strip())

        elif line.startswith("color_type"):
            color_type = int(line.split("=", 1)[1].strip())

        elif line.startswith("background_color"):
            color_values = line.split("=", 1)[1].split(",")
            for i in range(4):
                if i < len(color_values):
                    color_values[i] = int(color_values[i].strip())
                else:
                    color_values.append(0)
            # カラータイプが2以外の場合はアルファ値を255に設定
            if color_type != 2:
                color_values[3] = 255
            background_color = tuple(color_values)

        elif line.startswith("scale_preset"):
            scale_preset = line.split("=", 1)[1].strip().split(",")
            scale_preset = [s.strip() for s in scale_preset]

        elif line.startswith("space_preset"):
            space_preset = line.split("=", 1)[1].strip().split(",")
            space_preset = [s.strip().replace("\"", "") for s in space_preset]

        elif line.startswith("max_overlap_bg_color"):
            max_overlap_bg_color = int(line.split("=", 1)[1].strip())

    # スケールとスペースのインデックスが有効な範囲内か確認
    if use_scale_index < 0 or use_scale_index >= len(scale_preset):
        print(f"Invalid scale index: {use_scale_index}. Using default scale: {scale_preset[0]}")
        use_scale_index = 0

    if use_space_index < 0 or use_space_index >= len(space_preset):
        print(f"Invalid space index: {use_space_index}. Using default space: {space_preset[0]}")
        use_space_index = 0

    # 使用するスケールとスペースを取得
    scale = scale_preset[use_scale_index]
    space = space_preset[use_space_index]

    # 設定を表示
    print(f"\tFilename: {filename}")
    print(f"\tResize Width: {resize_width}")
    print(f"\tResize Height: {resize_height}")
    print(f"\tSmooth Repeat: {smooth_repeat}")
    print(f"\tColor Division: {color_division}")
    print(f"\tMax Row Colors: {max_row_colors}")
    print(f"\tColor Type: {color_type}")
    print(f"\tBackground Color: {background_color}")
    print(f"\tUse Scale: {scale}")
    print(f"\tUse Space: \"{space}\"")
    print(f"\tMax Overlap Background Color: {max_overlap_bg_color}")

    return {
        "filename": filename,
        "resize_width": resize_width,
        "resize_height": resize_height,
        "smooth_repeat": smooth_repeat,
        "color_division": color_division,
        "max_row_colors": max_row_colors,
        "color_type": color_type,
        "background_color": background_color,
        "use_scale": scale,
        "use_space": space,
        "max_overlap_bg_color": max_overlap_bg_color
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