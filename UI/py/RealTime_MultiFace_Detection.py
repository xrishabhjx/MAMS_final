#!/usr/bin/env python
# coding: utf-8

import cv2
import face_recognition
import numpy as np
import pickle
import time
import os
import sys

def get_attention_score():
    print("Python script started")

    # Directories
    curd = os.getcwd()
    print("Current directory:", curd)

    # Create required directories
    data_dir = os.path.join(curd, "assets", "data")
    try:
        os.makedirs(data_dir, exist_ok=True)
    except OSError as e:
        print(f"Error creating base data directory: {e}")
        sys.exit(1)

    # Read student ID from helper.txt
    try:
        with open("py/helper.txt", "r") as f:
            name = f.read().strip()
        print(f"Student registration number: {name}")
    except Exception as e:
        print(f"Error reading helper.txt: {e}")
        sys.exit(1)

    # Create student-specific directory
    student_path = os.path.join(data_dir, name)
    try:
        os.makedirs(student_path, exist_ok=True)
        print(f"Directory verified: {student_path}")
    except OSError as e:
        print(f"Error creating student directory: {e}")
        sys.exit(1)

    # Load Haar Cascade
    cascade_path = os.path.join(curd,'py', 'haarcascade_frontalface_default.xml')
    if not os.path.exists(cascade_path):
        print(f"Error: Haar cascade file not found at {cascade_path}")
        sys.exit(1)

    upperbody_cascade_path = os.path.join(curd, 'py',  'haarcascade_upperbody.xml')
    if not os.path.exists(upperbody_cascade_path):
        print(f"Error: Upper body cascade not found at {upperbody_cascade_path}")
        sys.exit(1)

    print("Upperbody cascade path:", upperbody_cascade_path)
    print("File exists:", os.path.exists(upperbody_cascade_path))
    print("File size:", os.path.getsize(upperbody_cascade_path) if os.path.exists(upperbody_cascade_path) else "N/A")

    upperbody_cascade = cv2.CascadeClassifier(upperbody_cascade_path)
    face_cascade = cv2.CascadeClassifier(cascade_path)

    # Load KNN model
    model_path = os.path.join(curd,'assets', 'models', 'trained_knn_model.clf')
    if not os.path.exists(model_path):
        print(f"Error: KNN model not found at {model_path}")
        sys.exit(1)

    with open(model_path, 'rb') as f:
        knn_clf = pickle.load(f)

    # Initialize camera
    camera_index = 0
    cap = None
    while camera_index < 3:
        cap = cv2.VideoCapture(camera_index)
        if cap.isOpened():
            print(f"Opened camera index {camera_index}")
            break
        camera_index += 1

    if cap is None or not cap.isOpened():
        print("No webcam detected.")
        sys.exit(1)

    # Initial face recognition
    print("[INFO] Capturing initial frame for recognition...")
    ret, initial_frame = cap.read()
    if not ret:
        print("Failed to read initial frame.")
        cap.release()
        sys.exit(1)

    rgb_frame = cv2.cvtColor(initial_frame, cv2.COLOR_BGR2RGB)
    face_locations = face_recognition.face_locations(rgb_frame)
    face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)

    if not face_encodings:
        print("No face detected. Exiting.")
        cap.release()
        sys.exit(1)

    recognized_name = "Unknown"
    face_encoding = face_encodings[0]
    closest_distances = knn_clf.kneighbors([face_encoding], n_neighbors=1)
    if closest_distances[0][0][0] <= 0.5:
        recognized_name = knn_clf.predict([face_encoding])[0]

    print(f"[INFO] Recognized: {recognized_name}")

    # Analyze posture
    print("[INFO] Starting head posture analysis...")
    head_up_count = 0
    num_photos = 5
    interval = 4  # seconds

    for i in range(num_photos):
        time.sleep(interval)
        ret, frame = cap.read()
        if not ret:
            print(f"Failed to read frame {i+1}")
            continue

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)

        if len(faces) > 0:
            head_up_count += 1
            print(f"Frame {i+1}/{num_photos}: Head Up")
        else:
            print(f"Frame {i+1}/{num_photos}: Head Down")

    attention_score = head_up_count / num_photos
    print(f"Final attention score (head down) for {recognized_name}: {attention_score:.2f}")

    # Warm-up camera
    for _ in range(5):
        cap.read()
        time.sleep(0.1)

    # Capture 10 images
    print("[INFO] Capturing 10 images...")
    count = 0
    while count < 10:
        ret, frame = cap.read()
        if not ret:
            print("Failed to grab frame")
            continue

        image_path = os.path.join(student_path, f"{name}{count}.jpg")
        try:
            cv2.imwrite(image_path, frame)
            print(f"Saved image {count+1}/10: {image_path}")
            count += 1
        except Exception as e:
            print(f"Error saving image: {e}")
        time.sleep(1)

    cap.release()
    cv2.destroyAllWindows()
    print(f" All done! {count} images saved. Attention Score: {attention_score:.2f}")

    return attention_score


if __name__ == "__main__":
    score = get_attention_score()
    print(f"Returned attention score: {score}")
