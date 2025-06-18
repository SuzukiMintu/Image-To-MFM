from LoadingFiles import *
from ImageFunctions import *
from ColorReduction import *
from GenerateMFM import *

def main():
    #==================================================
    # ファイル読み込み
    #==================================================

    # オプションファイルの読み込み
    option: dict[str, int] = LoadOptionFile("option.txt")
    if not option:
        print("Invalid option file.")
        return

    # 画像の読み込み
    img = LoadPngFile(option["filename"])
    if img is None:
        print("Failed to load image.")
        return

    #===================================================
    # 画像処理と色抽出
    #===================================================
  
    # 画像のリサイズ値の計算
    option["resize_width"], option["resize_height"] = CalculateResizeValue(img.size, (option["resize_width"], option["resize_height"]))
    if option["resize_width"] is None or option["resize_height"] is None:
        print("Invalid resize dimensions.")
        return

    # 画像のリサイズ
    img = ResizePngFile(img, [option["resize_width"], option["resize_height"]])
    if img is None:
        print("Failed to resize image.")
        return

    # 背景色の設定
    img = SetBackgroundColor(img, option["background_color"])
    if img is None:
        print("Failed to set background color.")
        return
  
    # 画像から色を抽出
    color_array = ConvertPngToArray(img)
    if color_array is None:
        print("Failed to convert image to color array.")
        return

    #===================================================
    # 減色処理
    #===================================================
    
    # 色を平均化
    print(f"Smooth repeat num: {option["smooth_repeat"]}")
    for i in range(option["smooth_repeat"]):
        print(f"\tSmooth count: {i+1}")
        color_array = SmoothColorArray(color_array)
        if color_array is None:
            print("Failed to smooth colors.")
            return

    # ピクセルの色を割り算して減色
    color_array = DivideColor(color_array, option["color_division"])
    if color_array is None:
        print("Failed to reduce colors.")
        return

    # 背景の色も同様に割り算して減色
    option["background_color"] = QuantizeColor(option["background_color"], option["color_division"])

    # k-meansクラスタリングで減色
    if option["max_row_colors"] > 0:
        print(f"Reducing colors per row with max_row_colors: {option['max_row_colors']}")
        color_array = ReduceColorsPerRow(color_array, option["max_row_colors"])

    #===================================================
    # MFMアートの生成と保存
    #===================================================
    
    # MFMアートの生成
    mfm_text: str = GenerateMFM(
        color_array,
        option["color_type"],
        option["background_color"],
        option["use_scale"],
        option["use_space"],
        option["max_overlap_bg_color"]
    )
    if mfm_text is None:
        print("Failed to generate MFM text.")
        return

    # MFMアートの保存
    output_filename = option["filename"].split("/")[-1]
    output_filename = output_filename.split(".")[0]
    is_output_complate = OutputMFM(mfm_text, output_filename)
    if not is_output_complate:
        print("Failed to save MFM art.")
        return

    # 完了メッセージの表示
    print(f"MFM art saved success.")
    # 出力したMFMの文字数を表示
    print(f"Output MFM character count: {len(mfm_text)}\n")

main()