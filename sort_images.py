import torch
from transformers import ViTForImageClassification, ViTImageProcessor
from safetensors.torch import load_file
from typing import Dict, List
from PIL import Image
import shutil
import argparse
import os

model_path = "model/model.safetensors"

model = ViTForImageClassification.from_pretrained("model")
state_dict = load_file(model_path)
model.load_state_dict(state_dict, strict=False)
model.eval()

processor = ViTImageProcessor.from_pretrained("model")

def predict(image_path):
    image = Image.open(image_path).convert("RGB")
    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs)
    logits = outputs.logits
    predicted_class = logits.argmax(-1).item()
    id2label = {0: "bad", 1: "good"}
    return id2label[predicted_class]

def move_images(src_folder: str, dest_folder: str):
    files = [f for f in os.listdir(src_folder) if ".DS_Store" not in f and f != "files.json"]
    for file in files:
        src = os.path.join(src_folder, file)
        if os.path.isdir(src):
            continue
        dest = os.path.join(dest_folder, file)
        shutil.move(src, dest)

def process_dir(dir: str):
    good_dir = os.path.join(dir, "good")
    bad_dir = os.path.join(dir, "bad")
    mid_dir = os.path.join(dir, "mid")
    process_dir = os.path.join(dir, "original")

    os.makedirs(good_dir, exist_ok=True)
    os.makedirs(bad_dir, exist_ok=True)
    os.makedirs(mid_dir, exist_ok=True)
    os.makedirs(process_dir, exist_ok=True)

    move_images(dir, process_dir)

    files = [f for f in os.listdir(process_dir) if os.path.isfile(os.path.join(process_dir, f)) and ".DS_Store" not in f]

    obj: Dict[str, List[str]] = {}
    for file in files:
        id = file if "_s" in file else file.split("_")[0]
        if id in obj:
            obj[id].append(os.path.join(process_dir, file))
        else:
            obj[id] = [os.path.join(process_dir, file)]

    i = 0
    for key, value in obj.items():
        ratings: List[str] = []
        for image in value:
            rating = predict(image)
            ratings.append(rating)

        if all(rating == "good" for rating in ratings):
            final_rating = "good"
        elif all(rating == "bad" for rating in ratings):
            final_rating = "bad"
        else:
            final_rating = "mid"

        for image in value:
            if final_rating == "good":
                shutil.move(image, os.path.join(good_dir, os.path.basename(image)))
            elif final_rating == "bad":
                shutil.move(image, os.path.join(bad_dir, os.path.basename(image)))
            else:
                shutil.move(image, os.path.join(mid_dir, os.path.basename(image)))
                
        print(f"{i + 1} / {len(obj)}")
        i += 1

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Image Sort")
    parser.add_argument("folderpath")
    args = parser.parse_args()
    process_dir(args.folderpath)